import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parents[1]
EXTRACTOR = TOOL_ROOT / "extract_text.py"


def make_docx(path: Path) -> None:
    document_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t>Area </w:t></w:r>
      <m:oMath><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:oMath>
    </w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Term</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:sectPr />
  </w:body>
</w:document>"""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", document_xml)


def make_pdf(path: Path) -> None:
    stream = b"BT /F1 12 Tf 72 720 Td (PDF extraction test) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode())
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    path.write_bytes(output)


def run_extractor(path: Path):
    return subprocess.run(
        [sys.executable, str(EXTRACTOR), str(path)],
        check=False,
        capture_output=True,
        text=True,
    )


class ExtractorTests(unittest.TestCase):
    def test_docx_text_and_common_omml_are_read(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.docx"
            make_docx(path)
            result = run_extractor(path)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertIn("Area x^{2}", payload["text"])
            self.assertIn("Term\tValue", payload["text"])
            self.assertEqual(payload["parser"], "docx-standard-library")

    @unittest.skipUnless(shutil.which("pdftotext"), "Poppler pdftotext is not installed")
    def test_pdf_text_is_read(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.pdf"
            make_pdf(path)
            result = run_extractor(path)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertIn("PDF extraction test", payload["text"])
            self.assertEqual(payload["parser"], "poppler-pdftotext")


if __name__ == "__main__":
    unittest.main()
