# MathLingo — 公開版數學文件翻譯工具

MathLingo 是一個保護數學公式的文件翻譯及常見用詞工具，適合處理英文與香港繁體中文數學材料。公開版內置通用數學詞庫及短句示例，不是任何出版社的官方詞庫，也不包含完整教材摘錄或私人來源連結。

## 功能

- 貼上文字，或匯入／拖放 `.txt`、`.md`、`.tex`、`.docx`、`.pdf` 文件
- 以 Google Docs 可供檢視連結匯入文件
- 使用公開數學詞庫搜尋、複製及套用常見用詞
- 使用示例庫測試公開試題型、出版社題型、課程文件、教案、學習目標、教學法及課堂教學用語
- 單頁工作台：出題改寫、EMI 課堂、HKEAA 核對及其他用途在同一頁切換，不建立內部跳頁
- 按年級／課題搜尋例子，直接送入「改寫成新題」；EMI 課堂用語可按分類以表格查看全部句子，點擊「使用這句」後在上方放大顯示
- 保留 Markdown 結構、變數、符號及常見 LaTeX 公式
- 使用離線詞庫、GPT-5.6 Luna、MiniMax、LocalAI 或其他本機 OpenAI-compatible LLM 翻譯
- 按「檢查服務」讀取本機 provider 設定、測試 `/models` endpoint 和列出可用 model id；不顯示 API key
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

## 單頁工作台與 GPT-5.6 Sol 設計取向

介面按 GPT-5.6 Sol 官方 model guidance 的工作流方向設計：先呈現使用者意圖，再用清晰的視覺層級和直接操作縮短流程。翻譯執行仍預設使用 GPT-5.6 Luna；需要時才在 `.env` 明確設定 Sol。參考[官方 GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model)。

工作區的「工作任務」有：`翻譯文件`、`改寫成新題`、`整理教案`。示例卡片可直接把題型載入新題改寫任務，課堂用語可直接加入 EMI pair practice。

EMI 課堂會把所選分類內的全部句子放在可獨立捲動的表格中；選取句子後，左側主卡片會放大顯示並標示目前列，方便教師與同學逐句練習。頁面保留原有工作區，切換 tab 或句子不會使用內部跳頁或強制向下捲動。

## GPT-5.6 Luna（OpenAI）

把 `.env.example` 複製為 `.env`，再填入雲端模型認證：

```bash
cp .env.example .env
OPENAI_TOKEN=your-token
```

認證只在本地 server 使用，瀏覽器不會讀取。模型預設為 `gpt-5.6-luna`；公式會先由 server 保護，再在結果中還原。需要 Sol 時可在 `.env` 明確設定 `OPENAI_MODEL=gpt-5.6-sol`。

## MiniMax

MiniMax 使用官方 OpenAI-compatible Chat Completions endpoint：

```bash
MINIMAX_API_KEY=your-token
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M3
LLM_PROVIDER=minimax
```

可在介面選擇 `MiniMax` 而不改變預設 provider。詳細 API 參數請參考 [MiniMax Chat Completions API](https://platform.minimax.io/docs/api-reference/text-chat-openai)。

## LocalAI

LocalAI 是獨立的本機 provider：

```bash
LOCALAI_BASE_URL=http://127.0.0.1:8080/v1
LOCALAI_MODEL=your-localai-model-id
LOCALAI_API_KEY=local-ai
LOCALAI_API_STYLE=chat
LLM_PROVIDER=localai
```

若未知道 model id，啟動 LocalAI 後按「檢查服務」；工具會嘗試讀取 `/v1/models`，並列出最多 30 個模型名稱。公開版不會替你啟動 LocalAI，也不會把本機 key 傳到瀏覽器。

## 示例庫與版權範圍

公開版的 `examples.js` 提供大量短句示例，包括 `show that`、`hence`、答案格式、數與代數、幾何、三角學、統計、微積分、`learning objective`、`success criteria`、`scaffolding`、`formative assessment`、`think–pair–share`、`show your working` 等。公開試部分連往 HKEAA 公開資源；出版社部分只保留題型與用語層次，以通用句子或自製改寫呈現，不重製完整試卷、教材頁面或 marking scheme。

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

DOCX 和 PDF 會先在本機提取文字；Google Docs 功能只接受 HTTPS 的 Google 文件連結，並由本地 server 取得可供檢視的匯出內容。原始文件不會寫回本工具。選擇 GPT-5.6 Luna 或 MiniMax 時，提取後的文字會送到所設定的雲端模型；選擇 LocalAI 或 Local LLM 時則只送到所設定的本機 endpoint。

公開版詞庫只供編輯起點使用；正式教材或出版文件仍應由編輯按實際上下文及 house style 覆核。
