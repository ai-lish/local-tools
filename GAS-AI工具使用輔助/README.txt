GAS × Local AI 使用輔助

這是可由 Drive-GAS Bridge 推送到 Google Apps Script 的本機 AI 教學工作台。
GAS 檔案為 Code.gs、Index.html 及 appsscript.json；README.md 是 GitHub 詳細說明，這份 README.txt 供 Bridge 顯示本次更新摘要。

## 本次更新
- 新增 Stable Diffusion 本機教學，涵蓋 ComfyUI、AUTOMATIC1111、模型位置及參數紀錄。
- 新增 MiniMax H3 本機教學，涵蓋 T2VA、I2VA、FL2VA、L2VA、Ref2VA 及 H3-Base 768p 使用邊界。
- 新增瀏覽器內提示語工作台，可產生 Stable Diffusion 及 H3 提示語，不呼叫外部 API。
- 新增原創安全動作詞庫、虛構示例成果、提示語檢視及本機媒體預覽。
- 新增成果紀錄欄位，可記錄模型、seed、參數、提示語及人工檢查結果。
- 加入無審查本機模型的授權、同意、私隱及輸出審查提醒；不放入真人、學校資料、露骨或違法素材。
- Bridge 推送時請只同步本資料夾；不要加入模型權重、真人媒體、校務文件或 API key。
- 接手現有 Apps Script 時，先在 Bridge 確認「發佈中為最新版本」，再用「檢查資料夾」及「同步到資料夾」拉回既有 .gs／.html；不要直接對空資料夾推送。

Bridge 編輯提醒：每次修改本資料夾內的 .gs、.html 或 appsscript.json 後，保留「## 本次更新」標題，並改寫標題下面的項目。
