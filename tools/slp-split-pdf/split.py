#!/usr/bin/env python3
"""
slp-split-pdf — Split CloudSAMS SLP PDF into smaller files.

Currently supports:
  - per-page: one output file per input page (default)
  - range:    one output file per user-specified page range (e.g. 1-5,10,15-20)

Future: student-boundary detection (when sample SLP PDF is provided).

Usage:
  python split.py --input my-slp.pdf --output-dir ./output
  python split.py --input my-slp.pdf --output-dir ./output --mode range --pages "1-5,10-20"
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import List, Tuple

from pypdf import PdfReader, PdfWriter


def parse_page_ranges(spec: str, total: int) -> List[Tuple[int, int]]:
    """Parse '1-5,10,15-20' into [(start, end), ...] 1-indexed inclusive."""
    ranges: List[Tuple[int, int]] = []
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            a, b = chunk.split("-", 1)
            start, end = int(a), int(b)
        else:
            start = end = int(chunk)
        if start < 1 or end > total or start > end:
            sys.exit(
                f"❌ Invalid range '{chunk}' (total pages = {total}; expected 1..{total})"
            )
        ranges.append((start, end))
    if not ranges:
        sys.exit(f"❌ --pages empty: '{spec}'")
    return ranges


def split_pdf(input_path: Path, output_dir: Path, mode: str, pages: str | None) -> int:
    if not input_path.exists():
        sys.exit(f"❌ Input file not found: {input_path}")
    output_dir.mkdir(parents=True, exist_ok=True)

    reader = PdfReader(str(input_path))
    total = len(reader.pages)
    print(f"📄 Input: {input_path.name} ({total} pages)")

    if mode == "per-page":
        ranges = [(i + 1, i + 1) for i in range(total)]
        suffix_tpl = "page-{n:03d}"
    else:  # range
        if not pages:
            sys.exit("❌ --pages required when --mode=range")
        ranges = parse_page_ranges(pages, total)
        suffix_tpl = "pages-{start:03d}-{end:03d}"

    stem = input_path.stem
    written: List[Path] = []
    for start, end in ranges:
        writer = PdfWriter()
        for pg_idx in range(start - 1, end):
            writer.add_page(reader.pages[pg_idx])
        suffix = suffix_tpl.format(n=start, start=start, end=end)
        out = output_dir / f"{stem}_{suffix}.pdf"
        with open(out, "wb") as f:
            writer.write(f)
        written.append(out)
        print(f"  ✂️  {suffix} → {out.name}")

    print(f"\n✅ Done. {len(written)} file(s) in {output_dir}")
    return 0


def main(argv: List[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Split CloudSAMS SLP PDF into smaller files")
    p.add_argument("--input", required=True, type=Path, help="Source PDF")
    p.add_argument("--output-dir", required=True, type=Path, help="Output folder")
    p.add_argument(
        "--mode",
        choices=["per-page", "range"],
        default="per-page",
        help="Split mode (default: per-page)",
    )
    p.add_argument(
        "--pages",
        help="Page ranges, e.g. '1-5,10,15-20'. Required when --mode=range",
    )
    args = p.parse_args(argv)
    return split_pdf(args.input, args.output_dir, args.mode, args.pages)


if __name__ == "__main__":
    sys.exit(main())
