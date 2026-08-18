#!/usr/bin/env python3
"""
tools/slp-split-pdf/main.py — dispatcher entrypoint（ARCHITECTURE.md §4.3）。

薄 adapter：argv → argparse → 業務函數。所有實際邏輯留喺 `split.py`
（因為現有 test 直接 `import split` 用 `split.split_pdf()`，唔可以改）。
呢個檔淨係俾 `cloudsams slp-split-pdf ...` 用；獨立行 `python split.py ...` 照樣得。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List

from split import split_pdf  # sibling module；dispatcher 已將 tool folder 加入 sys.path


def run(argv: List[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="cloudsams slp-split-pdf",
        description="Split CloudSAMS SLP PDF into smaller files",
    )
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
    sys.exit(run())
