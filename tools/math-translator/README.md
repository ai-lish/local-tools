# MathLingo — 公開版數學文件翻譯工具

MathLingo 是一個保護數學公式的文件翻譯及常見用詞工具，適合處理英文與香港繁體中文數學材料。公開版內置的是通用數學詞庫種子，不是任何出版社的官方詞庫，也不包含教材摘錄或私人來源連結。

## 功能

- 貼上文字，或匯入／拖放 `.txt`、`.md`、`.tex`、`.docx`、`.pdf` 文件
- 以 Google Docs 可供檢視連結匯入文件
- 使用公開數學詞庫搜尋、複製及套用常見用詞
- 保留 Markdown 結構、變數、符號及常見 LaTeX 公式
- 使用離線詞庫、GPT-5.6-sol 或本機 OpenAI-compatible LLM 翻譯
- 複製結果或下載為 Markdown

## 啟動

Node.js 18 或以上即可啟動本地 server：

```bash
npm start
```

然後開啟 <http://127.0.0.1:8787>。若只直接開啟 `index.html`，貼上文字、TXT／MD／TEX 及離線詞庫仍可使用；DOCX、PDF、Google Docs 和 AI 模式需要本地 server。

PDF 文字提取需要 Poppler 的 `pdftotext`。macOS 可執行：

```bash
brew install poppler
```

掃描或圖片 PDF 沒有文字層，需先用其他工具 OCR。DOCX 中的圖片、圖表及複雜公式也應在翻譯前後覆核。

## GPT-5.6-sol

把 `.env.example` 複製為 `.env`，再填入雲端模型認證：

```bash
cp .env.example .env
OPENAI_TOKEN=your-token
```

認證只在本地 server 使用，瀏覽器不會讀取。模型預設為 `gpt-5.6-sol`；公式會先由 server 保護，再在結果中還原。

## Local LLM

本機模型使用獨立的 OpenAI-compatible endpoint，不需要把內容送到 OpenAI：

```bash
LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_LLM_MODEL=qwen3:8b
LOCAL_LLM_TOKEN=local
LOCAL_LLM_API_STYLE=chat
```

可按實際模型服務修改 endpoint、model id 及 API style。工具本身不會替你啟動或上載模型。

## 文件匯入與資料流

DOCX 和 PDF 會先在本機提取文字；Google Docs 功能只接受 HTTPS 的 Google 文件連結，並由本地 server 取得可供檢視的匯出內容。原始文件不會寫回本工具。選擇 GPT-5.6-sol 時，提取後的文字會送到所設定的雲端模型；選擇 Local LLM 時則只送到所設定的本機 endpoint。

公開版詞庫只供編輯起點使用；正式教材或出版文件仍應由編輯按實際上下文及 house style 覆核。
