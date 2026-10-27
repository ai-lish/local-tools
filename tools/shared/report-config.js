// Fill these two values only after deploying the Apps Script Web App and
// creating the Google OAuth client in the owner's Google account.
export const REPORT_CONFIG = Object.freeze({
  webAppUrl: '',
  googleClientId: '',
  version: '0.1.0',
  sourceCommit: 'e9847c174d2ea67a4dd28244d54738452b81e3db'
});

export const REPORT_ENABLED = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(REPORT_CONFIG.webAppUrl) &&
  /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(REPORT_CONFIG.googleClientId);

export function applyReportButtonState(button) {
  button.disabled = !REPORT_ENABLED;
  button.textContent = REPORT_ENABLED ? '回報問題' : '回報問題（未啟用）';
  button.title = REPORT_ENABLED ? '' : '回報功能尚未啟用：請先設定 Apps Script Web App URL 及 Google Client ID。';
  button.setAttribute('aria-label', REPORT_ENABLED ? '開啟回報問題' : '回報問題，功能尚未啟用');
  button.style.cursor = REPORT_ENABLED ? 'pointer' : 'not-allowed';
  button.style.opacity = REPORT_ENABLED ? '' : '0.55';
}
