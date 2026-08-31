#!/usr/bin/env python3
"""Extract readable text from DOCX and PDF files for MathLingo.

DOCX extraction uses only Python's standard library so the local tool does not
need a package install for Word files.  PDF extraction delegates to Poppler's
pdftotext when it is available; scanned/image-only PDFs are reported as empty
text rather than being silently treated as successfully extracted.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def children_text(node: ElementTree.Element) -> str:
    """Render a small, readable subset of WordprocessingML/OMML."""

    name = local_name(node.tag)
    if name in {"t", "delText"}:
        return node.text or ""
    if name == "tab":
        return "\t"
    if name in {"br", "cr"}:
        return "\n"
    if name in {"oMath", "oMathPara"}:
        return omml_text(node)
    return "".join(children_text(child) for child in list(node))


def first_child(node: ElementTree.Element, name: str) -> ElementTree.Element | None:
    return next((child for child in list(node) if local_name(child.tag) == name), None)


def omml_text(node: ElementTree.Element) -> str:
    """Convert common Office Math nodes to a compact LaTeX-like token.

    The converter intentionally handles the structures most often produced by
    Word/Google Docs.  Unknown nodes fall back to their text content, keeping
    extraction useful without pretending to reproduce the original layout.
    """

    if node is None:
        return ""
    name = local_name(node.tag)
    if name == "t":
        return node.text or ""
    if name in {"oMath", "oMathPara", "e", "r", "ctrlPr", "rPr"}:
        return "".join(omml_text(child) for child in list(node))
    if name == "f":
        numerator = first_child(node, "num")
        denominator = first_child(node, "den")
        return r"\frac{" + omml_text(numerator) + "}{" + omml_text(denominator) + "}"
    if name == "sSup":
        base = first_child(node, "e")
        sup = first_child(node, "sup")
        return omml_text(base) + "^{" + omml_text(sup) + "}"
    if name == "sSub":
        base = first_child(node, "e")
        sub = first_child(node, "sub")
        return omml_text(base) + "_{" + omml_text(sub) + "}"
    if name == "sSubSup":
        base = first_child(node, "e")
        sub = first_child(node, "sub")
        sup = first_child(node, "sup")
        return omml_text(base) + "_{" + omml_text(sub) + "}^{" + omml_text(sup) + "}"
    if name == "rad":
        degree = first_child(node, "deg")
        expression = first_child(node, "e")
        degree_text = omml_text(degree)
        return r"\sqrt[" + degree_text + "]{" + omml_text(expression) + "}" if degree_text else r"\sqrt{" + omml_text(expression) + "}"
    if name == "nary":
        properties = first_child(node, "naryPr")
        operator = ""
        if properties is not None:
            chr_node = next((child for child in properties.iter() if local_name(child.tag) == "chr"), None)
            operator = (chr_node.attrib.get("{" + M_NS + "}val") or chr_node.attrib.get("val") or "") if chr_node is not None else ""
        return operator + omml_text(first_child(node, "sub")) + omml_text(first_child(node, "sup")) + omml_text(first_child(node, "e"))
    if name == "d":
        return "(" + omml_text(first_child(node, "e")) + ")"
    if name in {"acc", "bar", "box", "borderBox", "groupChr", "phant", "limLow", "limUpp", "func"}:
        return omml_text(first_child(node, "e"))
    return "".join(omml_text(child) for child in list(node))


def paragraph_text(node: ElementTree.Element) -> str:
    return "".join(children_text(child) for child in list(node))


def table_text(node: ElementTree.Element) -> str:
    rows = []
    for row in list(node):
        if local_name(row.tag) != "tr":
            continue
        cells = []
        for cell in list(row):
            if local_name(cell.tag) != "tc":
                continue
            blocks = []
            for block in list(cell):
                block_name = local_name(block.tag)
                if block_name == "p":
                    blocks.append(paragraph_text(block))
                elif block_name == "tbl":
                    blocks.append(table_text(block))
            cells.append("\n".join(blocks).strip())
        rows.append("\t".join(cells))
    return "\n".join(rows)


def extract_docx(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        try:
            root = ElementTree.fromstring(archive.read("word/document.xml"))
        except KeyError as exc:
            raise ValueError("DOCX 缺少 word/document.xml。") from exc

    body = next((child for child in list(root) if local_name(child.tag) == "body"), None)
    if body is None:
        raise ValueError("DOCX 沒有可讀取的文件內容。")

    blocks = []
    for block in list(body):
        name = local_name(block.tag)
        if name == "p":
            blocks.append(paragraph_text(block))
        elif name == "tbl":
            blocks.append(table_text(block))

    text = "\n".join(blocks)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    warnings = []
    if not text:
        warnings.append("DOCX 沒有提取到文字；可能主要由圖片或掃描內容組成。")
    if any(local_name(node.tag) in {"drawing", "pict", "object"} for node in root.iter()):
        warnings.append("文件含有圖片或繪圖；其內文未必能轉成可翻譯文字，請覆核公式及圖表。")
    return {"text": text, "parser": "docx-standard-library", "warnings": warnings}


def extract_pdf(path: Path) -> dict:
    executable = shutil.which("pdftotext")
    if not executable:
        raise ValueError("找不到 pdftotext。請安裝 Poppler，或先把 PDF 另存為 DOCX／TXT。")
    try:
        completed = subprocess.run(
            [executable, "-layout", str(path), "-"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=45,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("PDF 文字提取逾時，請分拆文件後再試。") from exc
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError("PDF 文字提取失敗。" + (" " + detail[:240] if detail else ""))
    text = completed.stdout.decode("utf-8", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\f", "\n\n")
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    warnings = []
    if not text:
        warnings.append("PDF 沒有提取到文字；可能是掃描／圖片 PDF，請先 OCR。")
    return {"text": text, "parser": "poppler-pdftotext", "warnings": warnings}


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: extract_text.py FILE"}, ensure_ascii=False), file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        suffix = path.suffix.lower()
        if suffix == ".docx":
            result = extract_docx(path)
        elif suffix == ".pdf":
            result = extract_pdf(path)
        else:
            raise ValueError("只支援 DOCX 或 PDF。")
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (OSError, ValueError, zipfile.BadZipFile, ElementTree.ParseError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
