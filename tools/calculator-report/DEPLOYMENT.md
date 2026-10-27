# 計算機問題回報接收端部署指引

本功能使用靜態前端及你自己部署的 Google Apps Script Web App。這次 PR 不會建立或連接任何 Google 資源。請用你自己的 Google 帳戶完成下列標有「你親手操作」的步驟；不要把私人 Sheet 設為公開。

## 1. 建立私人資料位置（你親手操作）

1. 在自己的 Google Drive 建立一份 Google 試算表，保持只有你和獲授權老師可存取。首次成功提交時，程式會在這份表內建立 `Reports`、`Private`、`Votes` 三個分頁及標題列。
2. 建立一個只供你管理的 Drive 資料夾，存放回報截圖。不要開啟「知道連結的任何人」存取。
3. 從試算表網址抄下 Sheet ID，並從資料夾網址抄下 Drive Folder ID。兩者只填入 Apps Script 專案屬性，不要貼入前端或公開議題。

## 2. 建立 Google OAuth Client ID（你親手操作）

1. 在自己的 Google Cloud 專案設定 OAuth 同意畫面，按帳戶類型及測試使用者規則完成必要設定。
2. 建立 OAuth Client ID，應用程式類型選「Web application」。
3. 在「Authorized JavaScript origins」加入 `https://math-lish.github.io`、`https://ai-lish.github.io` 及實際公開頁面所用的網域來源。來源只填 `https://網域`，不要附路徑；如果稍後改用自訂網域，須另外加入該網域來源。
4. 複製 Client ID（格式通常以 `.apps.googleusercontent.com` 結尾）。不要建立或填寫 Client Secret；前端只需要公開 Client ID。

## 3. 建立 Apps Script 專案及貼上程式（你親手操作）

1. 前往 [script.google.com](https://script.google.com/)，以自己的帳戶建立獨立 Apps Script 專案。
2. 把本目錄的 `Code.gs` 完整內容貼入 `Code.gs`，並在「專案設定」啟用顯示 `appsscript.json` 資訊清單，把本目錄的 `appsscript.json` 完整內容貼入資訊清單。
3. 在「專案設定 → 指令碼屬性」新增以下三項。值只存在你的 Apps Script 專案屬性：

   | 屬性 | 值 |
   | --- | --- |
   | `REPORT_SHEET_ID` | 第 1 節建立的 Sheet ID |
   | `SCREENSHOT_FOLDER_ID` | 第 1 節建立的 Drive Folder ID |
   | `GOOGLE_CLIENT_ID` | 第 2 節建立的 OAuth Client ID |

4. 儲存後，在 Apps Script 編輯器執行一次 `authorizeServices`，並按提示授權試算表、Drive 及外部 HTTPS 存取。這個檢查只讀取你已設定的資源名稱及 Google 公開金鑰，不會建立資料、上載檔案或寫入 log。程式不會在 log 記下 token、電郵或回報內容。
5. `appsscript.json` 已把外部 HTTPS 請求限制到 Google ID-token 公開金鑰端點 `https://www.googleapis.com/oauth2/v3/certs`。

## 4. 部署 Web App（你親手操作）

1. 按「部署 → 新增部署作業」，類型選「網頁應用程式」。
2. 「執行身分」選「我」；「誰可以存取」選「任何人」。公開端點只輸出回報分類、型號、簡述、狀態、修正版本及票數；登入電郵、帳戶雜湊及截圖連結只存於私人分頁。
3. 部署並複製以 `/exec` 結尾的 Web App URL。首次使用時可直接以瀏覽器開啟，列表應回傳 `{"ok":true,"reports":[]}`。
4. 檢查 Sheet 沒有公開分享，Drive 截圖資料夾也沒有公開分享。部署 URL 及 Client ID 請只交回 Codex 填入 `tools/shared/report-config.js`，不要放到學生可見的公開議題。

## 私隱及驗證方式

- 列表不回傳 email、Google 帳戶 ID、重演序列或截圖 Drive 連結。新回報的 email、帳戶雜湊與截圖連結分別寫入私人 `Private` 分頁；投票 email 和雜湊只在私人 `Votes` 分頁，用來限制每個帳戶每項一票及追溯濫用。`Reports` 分頁保留 `replay_json` 供老師查看，但 `doGet` 不會輸出該欄。老師只可在私人 Sheet 查看。
- 所有寫入 Sheet 的外來文字都會檢查公式前綴並以純文字保存；公開列表也會略過含有公式儲存格的整項回報，避免公式結果洩漏私人分頁內容。
- `doPost` 只接受 `text/plain` JSON，拒絕白名單以外欄位、未知分類、過長內容、超過 200 個按鍵或超過 300 KB 的截圖；Apps Script 以 Google 公開 RSA 金鑰本機驗證 ID-token 簽章，再逐項核對 `aud`、`iss`、`exp` 及已驗證電郵。公開金鑰會用 CacheService 暫存。每帳戶每 24 小時最多提交 5 項、投票 50 項；同一回報只可投一票，並用 LockService 序列化寫入。
- 回報列表為匿名唯讀；只有提交和投票需要 Google 登入。瀏覽器初次載入不會載入 Google 登入程式；只有使用者開始提交或投票時才會載入。
- 每次狀態更新請在 `Reports` 分頁將 `status` 改為 `received`、`processing` 或 `fixed`；修正後在 `fix_version` 填版本字串。
