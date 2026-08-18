#!/usr/bin/env python3
"""
class-photo-rename — 將班相檔案改名做 CloudSAMS <class_code><regno> 慣例。

背景：老師影班相之後，相機/手機出嚟嘅檔名通常係 `IMG_1234.jpg` 呢類流水號，
同 CloudSAMS 入面嘅學生班號（例如 `1A05` = 1A班 5號）冇任何對應關係。
呢個 tool 想做嘅嘢：讀一個資料夾嘅相 + 一份「檔名 → 班號」對應表
（例如人手影相時記低嘅次序，或者一個 CSV），將啲相改名做
`<class_code><regno>.<ext>`（例如 `1A05.jpg`），方便老師上載去 CloudSAMS
學生檔案，或者分派俾班主任逐個核對。

Status：呢個 folder 純粹示範「第二個 tool 點 fit 入 monorepo pattern」
（ARCHITECTURE.md §4.1 / §6 嘅 step-by-step recipe），業務邏輯未寫。
真正實作需要先睇一份 sample 對應表／相片，先定實際 CLI 參數。

Contract：同任何 tool 一樣，dispatcher 只需要呢個檔有 `run(argv) -> int`。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List


def run(argv: List[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="cloudsams class-photo-rename",
        description="Rename class photos to CloudSAMS <class_code><regno> convention",
    )
    p.add_argument("--input-dir", required=True, type=Path, help="資料夾，入面係原始班相")
    p.add_argument("--output-dir", required=True, type=Path, help="改名之後嘅相放呢度")
    p.add_argument(
        "--mapping",
        type=Path,
        help="檔名 → 班號對應表（CSV，欄位待定）。未提供時 TODO 邏輯會直接跳過",
    )
    p.parse_args(argv)

    # TODO: 讀 --mapping CSV，將 --input-dir 入面嘅相逐個 copy/rename 去
    #       --output-dir/<class_code><regno>.<ext>，衝突就報錯唔好靜靜覆寫。
    #       需要 sample 對應表先可以定實際格式（見上面 docstring）。
    print("TODO: class-photo-rename 未實作，呢個係 skeleton demo。")
    return 0


if __name__ == "__main__":
    sys.exit(run())
