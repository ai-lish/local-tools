/**
 * GAS × Local AI 使用輔助
 *
 * The project is intentionally a static, client-side prompt and tutorial
 * workbench. It does not call an external API, store user files, or upload
 * prompts/media. Browser-only functions live in Index.html.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('GAS × Local AI 使用輔助')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
