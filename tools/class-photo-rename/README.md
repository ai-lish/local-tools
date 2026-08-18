# class-photo-rename

將班相檔案改名做 CloudSAMS **`<class_code><regno>`** 慣例（例如 `1A05.jpg`），
方便上載學生檔案或派俾班主任核對。

> 🚧 **Status：wip / skeleton**。呢個 tool 暫時淨係示範點樣 fit 入 monorepo
> 架構及 publish boundary 留在 private source 文件，實際改名邏輯未寫。
> 需要一份 sample 檔名 → 班號對應表先可以定實際 CLI 格式。

## Quick Start（暫未可用，示意）

```bash
cd tools/class-photo-rename
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python main.py --input-dir ./raw-photos --output-dir ./renamed --mapping ./mapping.csv
```

或者經統一 CLI：

```bash
cloudsams class-photo-rename --input-dir ./raw-photos --output-dir ./renamed --mapping ./mapping.csv
```

## 安全

同其他 tool 一樣：純本機行，唔上載任何嘢。`output/` 已喺 root `.gitignore` 忽略。
對應表／相片入面如果有真實學生資料，**唔可以 commit**。
