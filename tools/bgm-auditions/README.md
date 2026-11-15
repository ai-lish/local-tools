# 背景音樂試聽

繁體中文靜態頁，用來逐款比較六款數學影片背景音樂。頁面在瀏覽器播放本目錄的 MP3，沒有登入、沒有上載，也沒有外部追蹤。

開啟 [`index.html`](index.html)。每款 30 秒，可切換純音樂或配旁白；`00` 是同一段無音樂旁白。比較合集 `comparison_00_to_06.mp3` 長 3:34.500，順序是無音樂，然後六款配上同一旁白。一次只播放一首。

純音樂約 −23.3 LUFS，只供聽音色，不可直接用這個音量套入影片。配旁白的有聲區，旁白與音樂相差 23.50 dB。選定後仍要按該條影片的旁白再混，目標大約低 22–25 dB。這個頁面不會改任何現有影片，也不會把任何一款設成音樂預設。

畫面上的偏好選擇重新整理後會清空。複製出來的文字要由使用者自己貼上；頁面不會自動送出。

## 已批准的產品資產

`audio/` 內原有 14 個 MP3 是明確批准、只供這個目錄使用的試聽產品資產，並列入 `publish.allowlist.json`，`publicMirror` 為 `true`。這不放寬倉庫原有規則：`outputs/`、`site/`、source map、生成紀錄、中間檔及生成程式仍然不得提交。

本目錄公開的檔案只有試聽頁、這份說明、23 個 MP3（原有 14 個加 9 個 AI 生成），以及 `licenses/` 的授權與核對摘要。沒有帶入生成 log、絕對路徑、乾聲副本或音色檔。

## AI 生成試驗版本

頁面下方另有 9 個由 MiniMax-Music3 模型在本機離線生成的純音樂 MP3：`ai01`–`ai07` 及壓縮方式對照 `ai_cmp_4bit`／`ai_cmp_allgpu`。頁面清楚標明屬機器生成，以符合該模型 Acceptable Use Policy 第 11 條的公開披露要求。每段要求 30 秒，但模型會提早收尾，實際長度 11.1–30.0 秒，對照組各 10 秒；音量約 −23 LUFS。提示語、seed 及生成紀錄只留在本機，不入 repo。模型授權全文見 [`licenses/MiniMax-Music3-LICENSE.txt`](licenses/MiniMax-Music3-LICENSE.txt)。

授權：

- 原創編曲，2026-11-08。
- FluidR3 GM，Frank Wen，MIT，見 [`licenses/FluidR3-COPYING.txt`](licenses/FluidR3-COPYING.txt)。
- TinySoundFont，Bernhard Schelling，MIT，見 [`licenses/TinySoundFont-LICENSE.txt`](licenses/TinySoundFont-LICENSE.txt)。
- AI 生成版本：MiniMax-Music3 Community License，見 [`licenses/MiniMax-Music3-LICENSE.txt`](licenses/MiniMax-Music3-LICENSE.txt)。
- 來源說明見 [`licenses/SOURCES.txt`](licenses/SOURCES.txt)。
