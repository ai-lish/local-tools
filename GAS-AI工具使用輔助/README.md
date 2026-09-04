# GAS × Local AI 使用輔助

這是一個 Google Apps Script（GAS）HTML Service 專案，定位是 **MiniMax H3 GitHub 專案的本機使用輔助層**：把本機 Stable Diffusion、MiniMax H3 的部署概念、提示語結構、成果紀錄與安全檢查集中在一個可以直接部署的介面內。

## 目前包含

- Stable Diffusion 本機入門：以 ComfyUI 為主、AUTOMATIC1111 WebUI 為替代；包含模型檔案位置、參數紀錄與參考測試組。
- MiniMax H3 本機入門：T2VA、I2VA、FL2VA、L2VA、Ref2VA 的選擇、H3-Base 本機流程與 768p／2K 的邊界。
- 提示語工作台：產生 Stable Diffusion 正向／負向提示語，或按 H3 官方欄位骨架產生多鏡頭影音提示語。
- 精選動作詞庫：以使用者提供的 Stable Diffusion 動作提詞文章作為閱讀參考，重新整理成少量原創、安全示例，不複製整篇文章。
- 示例成果：以校園閱讀角、產品靜物、雨後走廊等合成情境展示提示語、參數與品質檢查；示意縮圖不是模型實際輸出。
- 本機成果紀錄：可在瀏覽器暫時預覽自己選取的圖片／影片，紀錄模型、seed、參數與人工檢查結果；資料不會透過此專案上傳或寫入 GAS。

## 安裝到 GAS

1. 在 [Google Apps Script](https://script.google.com/) 建立空白專案。
2. 建立 `Code.gs`、`Index.html` 及 `appsscript.json`，把本資料夾內同名檔案內容貼上。
3. 儲存後按「部署 → 新增部署作業 → 網頁應用程式」。
4. 以自己的帳戶執行，按照學校／機構的 Google Workspace 權限政策分享。

若只想先試介面，也可以直接用瀏覽器開啟 `Index.html`；GAS 的 `doGet()` 只負責輸出頁面。

## 使用 Drive-GAS Bridge 推送

本資料夾就是 Bridge 的同步來源，請把 Bridge 的 source folder 指向 `GAS-AI工具使用輔助/`，不要指向整個 repository。建議按以下檔名一對一同步：

- `Code.gs` → Apps Script 的 `Code.gs`
- `Index.html` → Apps Script 的 `Index.html`
- `appsscript.json` → Apps Script manifest（如 Bridge 支援 manifest 同步）
- `README.txt` → Bridge 的本次更新摘要；請保留 `## 本次更新` 標題並更新其下項目

`README.md` 是 GitHub／本機閱讀版，不需要推送到 Apps Script；`README.txt` 是 Bridge 讀取的維護說明，通常會保留在 Drive 資料夾內。

推送後，先在 Apps Script 編輯器檢查檔案是否齊全，再用現有部署作業測試 `doGet()`。本專案沒有需要由 Bridge 傳送的模型權重、真人媒體、學校資料或 API key；不要把這些檔案加入同步來源。部署 ID、Script ID 及 Drive 目標請保留在 Bridge 的本機設定，不要寫入 GitHub README。

## 隱私與安全範圍

本專案沒有 `fetch`、XMLHttpRequest、外部 JavaScript、CDN、analytics、`google.script.run` 或第三方 API。瀏覽器預覽使用者選取的媒體只存在目前分頁的記憶體；「下載紀錄」是使用者主動將文字 JSON 下載到自己的裝置，不會送到伺服器。

「無審查版 local AI」只在本專案中作為技術風險說明：本機模型可能沒有平台端的內容過濾，並不代表可以繞過法律、授權、同意或校內政策。請勿使用真實學生／教職員姓名、相片、校務文件、私密影像或未經同意的聲音；禁止製作露骨性內容、未成年人性內容、非自願換臉／裸體、冒充真人、仇恨或現實傷害指示。輸出公開前必須有人工作內容、版權及身份誤導檢查。

## 來源與校對重點

資料校對日期：2026-09-04。模型與工具會更新，部署前應重新查看官方文件及模型授權。

- [MiniMax-AI/MiniMax-H3](https://github.com/MiniMax-AI/MiniMax-H3)：官方 H3 GitHub；本介面採用其公開的模式分類及提示語欄位概念。
- [H3 prompt writing skill](https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills/h3-prompt-writing)：H3 的 prompt 結構參考；本專案以自己的安全示例重新編寫。
- [MiniMaxAI/MiniMax-H3 model card](https://huggingface.co/MiniMaxAI/MiniMax-H3)：本機 H3-Base、FL2VA／Ref2VA、BF16 與輸入輸出限制的參考。
- [ComfyUI](https://github.com/Comfy-Org/ComfyUI)：本機節點式工作流與模型資料夾說明。
- [AUTOMATIC1111/stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui)：另一種本機 Stable Diffusion WebUI 路線。
- [Stable Diffusion：AI 繪圖動作提詞百選](https://mnya.tw/cc/word/2418.html)：使用者提供的動作提詞閱讀參考；本專案只取方法脈絡，不收錄整篇內容或原文示範圖。

## H3 本機部署的實務提醒

官方 H3 說明把完整系統分成 H3-Context-IR、H3-Base 與 H3-Regenerate-2K。這個 GAS 專案只協助本機提示語與流程規劃，不會呼叫 Context-IR 或 2K API。嚴格離線時，請以本機 H3-Base 的 768p 驗證為目標；官方 SGLang 範例使用多 GPU，H3 是大型模型，實際 VRAM／速度必須按所選推理框架和硬體測試，不能把示例硬體當成最低要求。

## GitHub 延伸建議

若要把本專案放回 MiniMax H3 的 fork 或內部 GitHub repo，建議保持兩層分離：

- 上游模型程式碼、權重及其授權檔留在原本的模型／推理專案。
- `GAS-AI工具使用輔助/` 只放教學、提示語模板、示例成果紀錄與前端工具，不放模型權重、真人素材或學校資料。

這樣可以在上游更新時重新核對提示語格式，也能避免 GAS 專案意外成為大型模型檔案或敏感素材的儲存位置。
