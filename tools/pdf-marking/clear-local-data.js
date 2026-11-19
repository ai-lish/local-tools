(function (root) {
  "use strict";

  function init() {
    var button = document.getElementById("clear-local-data-open");
    var panel = document.getElementById("clear-local-data-confirmation");
    var confirmButton = document.getElementById("clear-local-data-confirm");
    var cancelButton = document.getElementById("clear-local-data-cancel");
    var status = document.getElementById("clear-local-data-status");
    if (!button || !panel || !confirmButton || !cancelButton || !status) return;

    if (root.location && root.location.hash === "#local-data-cleared") {
      status.hidden = false;
      status.textContent = "已清除本機資料";
      status.classList.remove("is-error");
      try { root.history.replaceState(null, "", root.location.pathname + root.location.search); } catch (error) { /* Some file:// browsers do not allow history URL updates. */ }
    } else if (root.location && root.location.hash === "#local-data-partial") {
      status.hidden = false;
      status.textContent = "已重新載入，但部分本機資料未能清除；請檢查瀏覽器儲存權限。";
      status.classList.add("is-error");
      try { root.history.replaceState(null, "", root.location.pathname + root.location.search); } catch (error) { /* Some file:// browsers do not allow history URL updates. */ }
    }

    button.addEventListener("click", function () {
      panel.hidden = false;
      status.hidden = true;
      confirmButton.focus();
    });
    cancelButton.addEventListener("click", function () {
      panel.hidden = true;
      button.focus();
    });
    confirmButton.addEventListener("click", function () {
      confirmButton.disabled = true;
      cancelButton.disabled = true;
      var result = root.PdfMarkingTemplateStore.clearOwnedData(root);
      root.location.hash = result.ok ? "local-data-cleared" : "local-data-partial";
      root.location.reload();
    });
  }

  if (typeof document !== "undefined") init();
})(typeof window !== "undefined" ? window : globalThis);
