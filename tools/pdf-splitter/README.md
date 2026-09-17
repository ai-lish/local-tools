# 📄 PDF 分割工具

純前端 PDF 分割工具，無需上傳，瀏覽器內處理，支援 3 種分割模式。

🔗 **線上使用**：https://ai-lish.github.io/pdf-splitter/

亦可從 [AI-LISH Local Tools](https://ai-lish.github.io/local-tools/) 首頁開啟。

## ✨ 特色

- 🔒 **100% 私隱** — 檔案完全喺瀏覽器處理，唔上傳任何 server
- ⚡ **三種分割模式**
  - **每 N 頁一份**：例如每 3 頁切一份
  - **自訂範圍**：`1-3, 5, 7-9` → 每段一份
  - **只保留指定頁**：`1, 3, 5-7` → 合併一份
- 📦 **ZIP 打包下載** — 多份 PDF 自動 zip
- 🎯 **拖拽操作** — Drag & drop 載入
- 📱 **響應式** — 桌面、平板、手機都可用
- 🌐 **零依賴** — 純 HTML + JS（CDN: pdf-lib + jszip）

## 🚀 使用方法

1. 開 [https://ai-lish.github.io/pdf-splitter/](https://ai-lish.github.io/pdf-splitter/)
2. 拖拽 PDF 落去
3. 揀模式 + 設定範圍
4. 撳「開始分割」
5. 自動下載 ZIP

## 🛠 技術

- [pdf-lib](https://github.com/Hopding/pdf-lib) — PDF 處理
- [JSZip](https://github.com/Stuk/jszip) — ZIP 打包
- GitHub Pages 託管

## 📝 License

MIT
