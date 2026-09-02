# 公開 CloudSAMS bridge tools

這個目錄提供只在本機執行的 CloudSAMS bridge tools。工具不會連接或上載到
CloudSAMS server；請先閱讀各工具的 README，再處理任何真實資料。

## 工具狀態

- `slp-split-pdf`：`stable`，可用 browser HTML（slp-split-pdf/index.html）
  或 Python CLI 按頁或指定範圍分割 SLP PDF；PDF 只在本機處理。
- `class-photo-rename`：`wip` skeleton，改名邏輯尚未完成，不可用於正式學生相片。
- `math-translator`：`beta`，單頁工作台、通用數學詞庫、公開試／出版社題型、教學語境示例及 EMI 分類表格；可在本地 server 模式匯入 DOCX、PDF 及可供檢視的 Google Docs，並選用 GPT-5.6 Luna、MiniMax、LocalAI 或其他 OpenAI-compatible LLM。
- `html-lab`：單檔 HTML 即時測試台，支援 HTML、CSS、JavaScript、小遊戲及互動 Demo。

使用者需要自行安裝 Python 及各工具的 `requirements.txt` 依賴。input、output、
mapping、學生資料及相片只應留在本機，不得提交到 Git 或上載到任何公開服務。
