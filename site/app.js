// Shared helpers for the account/dashboard pages. Vanilla JS, no build
// step, matching how the rest of this site is authored.
(function (global) {
  "use strict";

  var TOKEN_KEY = "pdftk_session_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  /** Redirects to /login if there's no token at all. Pages that require auth call this first. */
  function requireAuthOrRedirect() {
    if (!getToken()) {
      location.href = "/login";
      return false;
    }
    return true;
  }

  /**
   * Wraps fetch with the Authorization header and consistent JSON handling.
   * On 401 (session missing/expired/revoked — e.g. the 1-hour idle timeout
   * lapsed), clears the stored token and redirects to /login rather than
   * leaving the page in a broken half-authenticated state.
   */
  function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    var token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

    return fetch(path, Object.assign({}, options, { headers: headers })).then(function (res) {
      if (res.status === 401) {
        clearToken();
        location.href = "/login?expired=1";
        // Return a never-resolving promise so callers' .then() doesn't run
        // against a page that's already navigating away.
        return new Promise(function () {});
      }
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function escapeHtml(input) {
    return String(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showAlert(el, message, kind) {
    el.textContent = message;
    el.className = "alert show alert-" + (kind || "error");
  }
  function hideAlert(el) {
    el.className = "alert";
  }

  function setFieldError(fieldEl, message) {
    var errorEl = fieldEl.querySelector(".field-error");
    if (errorEl) errorEl.textContent = message;
    fieldEl.classList.add("has-error");
  }
  function clearFieldError(fieldEl) {
    fieldEl.classList.remove("has-error");
  }

  global.PdfToolkitAuth = {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    requireAuthOrRedirect: requireAuthOrRedirect,
    apiFetch: apiFetch,
    escapeHtml: escapeHtml,
    showAlert: showAlert,
    hideAlert: hideAlert,
    setFieldError: setFieldError,
    clearFieldError: clearFieldError,
  };
})(window);
