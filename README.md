# 少康教學離線工具

這是 `math-lish/local-tools` 經安全 allowlist 產生的 public deployment，
部署於 [ai-lish.github.io/local-tools](https://ai-lish.github.io/local-tools/)。

公開工具只在使用者自己的瀏覽器或電腦處理檔案，不會上載到網站伺服器或
CloudSAMS server。學校來源資料、學生／教師真實資料、mapping 及 credentials
不屬於這個 public repository。

## 公開項目

- 教師人力與行政架構單檔工具
- 活動資料分析工具（去識別化公開版）
- 圖片像素提升工具
- 相機圖片合併工具
- CloudSAMS SLP PDF 分割 HTML／CLI（`stable`）
- CloudSAMS 班相改名 CLI（`wip` skeleton，尚未可正式使用）
- MathLingo 數學文件翻譯工具（`beta`；通用詞庫、公開試／出版社題型、教案示例、EMI 分類表格及本機文件匯入）

CloudSAMS tools 只在本機執行；SLP PDF HTML 會在瀏覽器內處理，
CLI 使用者需要自行安裝 Python 及依賴。請先閱讀各工具目錄內的 README，
再處理任何真實資料。

PDF 工具箱暫未列入這個 public deployment，因現有版本仍依賴外部資源。

MathLingo 的公開版包含通用數學詞庫、單頁工作台及短句示例，不是任何出版社的官方詞庫；完整本地 server、DOCX／PDF／Google Docs 匯入、GPT-5.6 Luna、MiniMax、LocalAI 及設定方式見
[`tools/math-translator/README.md`](tools/math-translator/README.md)。
