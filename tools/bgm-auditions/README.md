# AI 純音樂試聽

繁體中文靜態頁，用來試聽 MiniMax-Music3 模型在本機生成的純音樂。頁面在瀏覽器播放本目錄的 MP3，沒有登入、沒有上載，也沒有外部追蹤。

開啟 [`index.html`](index.html)。頁面有七首有主旋律、可單獨聆聽的純音樂（`ai01`–`ai07`），另有一組壓縮方式對照（`ai_cmp_4bit`／`ai_cmp_allgpu`，各 10 秒）。一次只播放一首。每首要求 30 秒，但模型會提早收尾，實際長度 12.7–30.0 秒；音量約 −23 LUFS。

頁面清楚標明全部屬機器生成，以符合 MiniMax-Music3 授權 Acceptable Use Policy 第 11 條的公開披露要求。提示語、seed 及生成紀錄只留在本機，不入 repo。

畫面上的偏好選擇重新整理後會清空。複製出來的文字要由使用者自己貼上；頁面不會自動送出。

## 公開檔案

公開的只有試聽頁、這份說明、`audio/` 內 9 個 AI 生成 MP3，以及 `licenses/` 的 `MiniMax-Music3-LICENSE.txt`、`SOURCES.txt`、`ASSET_SHA256.txt`。這不放寬倉庫原有規則：`outputs/`、`site/`、source map、生成紀錄、中間檔及生成程式仍然不得提交。

2026-11-15 用家決定頁面只提供 AI 版。2026-11-08 的六款原創編曲、配旁白版本、比較合集及其 FluidR3／TinySoundFont 授權檔仍留在本目錄，但已從頁面及 `publish.allowlist.json` 移除，不再公開。

授權：AI 生成版本使用 MiniMax-Music3 Community License，見 [`licenses/MiniMax-Music3-LICENSE.txt`](licenses/MiniMax-Music3-LICENSE.txt)；來源說明見 [`licenses/SOURCES.txt`](licenses/SOURCES.txt)。
