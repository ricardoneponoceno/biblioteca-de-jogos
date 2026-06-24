/**
 * Shared login + polling runtime for the site-admin pages (the settings
 * dashboard and the standalone chat thread). Both authenticate with the same
 * admin token, store it under the same key, and poll `/api/admin/site` for a
 * fresh snapshot, so that flow lives here and each page supplies only its own
 * `onRender` and a couple of cleanup hooks.
 */

import { createAutoRefresh, createCredentialStore, createStatusSetter, postJson } from "./hosted-common.mjs";

export const ADMIN_SESSION_STORAGE_KEY = "townsquare-admin-session";
const REFRESH_INTERVAL_MS = 5000;

/**
 * @param {object} options
 * @param {string} options.redirectPath Path to clean URL credentials back to.
 * @param {object} options.elements Login/admin view DOM nodes.
 * @param {(data: any) => void} options.onRender Called with each site snapshot.
 * @param {(message: string) => void} [options.onError] Called when a load or
 *   action request fails while the admin view is visible.
 * @param {() => void} [options.onBeforeShowLogin] Tear-down before login shows.
 * @param {() => void} [options.onClear] Cleanup when credentials are dropped.
 * @param {number} [options.refreshIntervalMs]
 */
export function createAdminSession({
  redirectPath,
  elements,
  onRender,
  onError,
  onBeforeShowLogin,
  onClear,
  refreshIntervalMs = REFRESH_INTERVAL_MS,
}) {
  const { loginView, adminView, loginForm, loginToken, rememberMe: rememberMeEl, loginSubmit, loginStatus, signOut } = elements;

  const credentialStore = createCredentialStore(ADMIN_SESSION_STORAGE_KEY);
  const setLoginStatus = createStatusSetter(loginStatus, { toggleHidden: true });
  const autoRefresh = createAutoRefresh(() => loadSite({ silent: true }), refreshIntervalMs);

  let siteKey = "";
  let adminToken = "";
  let rememberMe = false;
  let loadSeq = 0;

  function readStoredCredentials() {
    const stored = credentialStore.read();
    const value = stored?.value;
    if (value && typeof value.adminToken === "string") {
      rememberMe = stored.remembered;
      return { siteKey: value.siteKey || "", adminToken: value.adminToken };
    }
    return { siteKey: "", adminToken: "" };
  }

  function readCredentials() {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const urlSiteKey = queryParams.get("siteKey") || hashParams.get("siteKey") || "";
    const urlAdminToken = hashParams.get("adminToken") || queryParams.get("adminToken") || "";

    if (urlSiteKey || urlAdminToken) {
      window.history.replaceState({}, document.title, redirectPath);
      return { siteKey: urlSiteKey, adminToken: urlAdminToken };
    }

    return readStoredCredentials();
  }

  function storeCredentials() {
    credentialStore.save({ siteKey, adminToken }, rememberMe);
  }

  function clearCredentials() {
    siteKey = "";
    adminToken = "";
    onClear?.();
    credentialStore.clear();
  }

  function showLogin(message = "", isError = false) {
    autoRefresh.stop();
    onBeforeShowLogin?.();
    adminView.hidden = true;
    loginView.hidden = false;
    setLoginStatus(message, isError);
    loginToken.focus();
  }

  function showAdmin() {
    loginView.hidden = true;
    adminView.hidden = false;
    autoRefresh.start();
  }

  async function loadSite({ silent = false } = {}) {
    const seq = ++loadSeq;

    if (!adminToken) {
      showLogin();
      return;
    }

    if (!siteKey) {
      const login = await postJson("/api/admin/login", { adminToken });
      if (seq !== loadSeq) return;
      if (!login.ok) {
        clearCredentials();
        showLogin(login.body.error || "Could not open admin with that token.", true);
        return;
      }
      siteKey = login.body.site.siteKey;
    }

    const result = await postJson("/api/admin/site", { siteKey, adminToken });
    if (seq !== loadSeq) return;
    if (!result.ok) {
      if (result.status === 403) {
        clearCredentials();
        showLogin("That admin token no longer works.", true);
        return;
      }
      if (!silent) {
        onError?.(result.body.error || "Could not load this site.");
      }
      return;
    }

    storeCredentials();
    showAdmin();
    onRender(result.body);
  }

  async function action(name, data = {}) {
    const result = await postJson("/api/admin/action", { siteKey, adminToken, action: name, ...data });
    if (!result.ok) {
      onError?.(result.body.error || "Action failed.");
      return false;
    }

    await loadSite();
    return true;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginSubmit.disabled = true;
    setLoginStatus("Checking token...");

    adminToken = loginToken.value.trim();
    rememberMe = rememberMeEl?.checked ?? false;
    siteKey = "";
    await loadSite();

    loginSubmit.disabled = false;
    if (!adminView.hidden) {
      loginForm.reset();
      setLoginStatus("");
    }
  });

  signOut?.addEventListener("click", () => {
    clearCredentials();
    showLogin("Signed out. Your token was forgotten on this device.");
  });

  function start() {
    const credentials = readCredentials();
    siteKey = credentials.siteKey;
    adminToken = credentials.adminToken;
    if (rememberMeEl) rememberMeEl.checked = rememberMe;

    if (adminToken) {
      loadSite();
    } else {
      showLogin();
    }
  }

  return { start, loadSite, action, showLogin, setLoginStatus };
}
