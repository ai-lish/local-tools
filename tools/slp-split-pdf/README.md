# SLP Split PDF

將 CloudSAMS **SLP（Student Learning Profile，學生學習概覽）** PDF 拆做多份細檔案，方便：

- 個別學生檔案分發
- 班務/班主任作業
- 系統匯入（個別 SLP 入唔同系統）

## Quick Start

```bash
cd tools/slp-split-pdf
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 每頁一個 file
python split.py --input /path/to/slp.pdf --output-dir ./output

# 自訂 page range
python split.py --input /path/to/slp.pdf --output-dir ./output \
  --mode range --pages "1-5,10-20"
```

Output: `output/<original-stem>_page-001.pdf`, `_page-002.pdf`, ...

## Modes

| Mode | Description |
|---|---|
| `per-page`（default）| 每頁一個 file |
| `range` | 按 `--pages` 指定 range，每段一個 file |

`--pages` 格式：`1-5,10,15-20`（1-indexed, inclusive）。

## Status

- ✅ v0.1 — `per-page` + `range` mode
- 🚧 TBD — `per-student` mode（按學生姓名/學號自動識別邊界）— 需要 sample PDF

## Known Limitations

- 純處理 PDF，唔讀內容。如要「按學生 split」需要先畀 sample PDF，再加 heuristics（學生名位置、班別 code、頁首 footer 等）
- 唔處理 password-protected PDF

## 安全

呢個工具完全喺本機行，唔上載任何嘢。請確保 `output/` folder 都唔好 commit 入 git（已喺 root `.gitignore` 加入 `*/output/`）。
