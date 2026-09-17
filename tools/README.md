# 公開本機工具

這個目錄提供只在本機執行的工具。工具不會把輸入檔案上載到網站或
CloudSAMS server；請先閱讀各工具的 README，再處理任何真實資料。

## 工具狀態

- `pdf-splitter`：`stable`，瀏覽器內按每 N 頁、自訂範圍或指定頁分割 PDF，支援 ZIP
  下載、解除列印限制及其他本機 PDF 操作；PDF 只在本機處理。
- `slp-split-pdf`：`stable`，可用 browser HTML（slp-split-pdf/index.html）
  或 Python CLI 按頁或指定範圍分割 SLP PDF；PDF 只在本機處理。
- `hkdse-question-split`：`wip`，瀏覽器內逐題確認 HKDSE PDF 題界，支援跨頁拼接
  及穩定檔名圖片輸出；不連接 Drive 或 HKDSE 試算表。
- `class-photo-rename`：`wip` skeleton，改名邏輯尚未完成，不可用於正式學生相片。
- `math-translator`：`beta`，單頁工作台、通用數學詞庫、公開試／出版社題型、教學語境示例及 EMI 分類表格；可在本地 server 模式匯入 DOCX、PDF 及可供檢視的 Google Docs，並選用 GPT-5.6 Luna、MiniMax、LocalAI 或其他 OpenAI-compatible LLM。

使用者需要自行安裝 Python 及各工具的 `requirements.txt` 依賴。input、output、
mapping、學生資料及相片只應留在本機，不得提交到 Git 或上載到任何公開服務。
