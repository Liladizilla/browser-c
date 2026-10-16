const api = window.browserC;
const address = document.querySelector("#address");
const form = document.querySelector("#address-form");
const back = document.querySelector("#back");
const forward = document.querySelector("#forward");
const reload = document.querySelector("#reload");
const home = document.querySelector("#home");
const newTab = document.querySelector("#new-tab");
const newPrivateTab = document.querySelector("#new-private-tab");
const windowMinimize = document.querySelector("#window-minimize");
const windowMaximize = document.querySelector("#window-maximize");
const windowClose = document.querySelector("#window-close");
const printPage = document.querySelector("#print-page");
const savePageAs = document.querySelector("#save-page-as");
const savePagePdf = document.querySelector("#save-page-pdf");
const captureScreenshot = document.querySelector("#capture-screenshot");
const translatePage = document.querySelector("#translate-page");
const openDevTools = document.querySelector("#open-devtools");
const tabsNode = document.querySelector("#tabs");
const status = document.querySelector("#status");
const retryNavigation = document.querySelector("#retry-navigation");
const bookmarkCurrent = document.querySelector("#bookmark-current");
const showBookmarks = document.querySelector("#show-bookmarks");
const showHistory = document.querySelector("#show-history");
const showDownloads = document.querySelector("#show-downloads");
const clearSitePermissions = document.querySelector("#clear-site-permissions");
const searchProviderSelect = document.querySelector("#search-provider");
const openSettings = document.querySelector("#open-settings");
const openPasswords = document.querySelector("#open-passwords");
const passwordPanel = document.querySelector("#password-panel");
const closePasswords = document.querySelector("#close-passwords");
const passwordForm = document.querySelector("#password-form");
const passwordSite = document.querySelector("#password-site");
const passwordUsername = document.querySelector("#password-username");
const passwordSecret = document.querySelector("#password-secret");
const passwordList = document.querySelector("#password-list");
const passwordVaultNote = document.querySelector("#password-vault-note");
let lastPasswordTrigger = null;
const settingsPanel = document.querySelector("#settings-panel");
const closeSettings = document.querySelector("#close-settings");
const settingsForm = document.querySelector("#settings-form");
const themeSetting = document.querySelector("#theme-setting");
const homepageSetting = document.querySelector("#homepage-setting");
let lastSettingsTrigger = null;
const libraryPanel = document.querySelector("#library-panel");
const libraryTitle = document.querySelector("#library-title");
const libraryList = document.querySelector("#library-list");
const closeLibrary = document.querySelector("#close-library");
const clearHistory = document.querySelector("#clear-history");
const findBar = document.querySelector("#find-bar");
const findQuery = document.querySelector("#find-query");
const findPrevious = document.querySelector("#find-previous");
const findNext = document.querySelector("#find-next");
const findClose = document.querySelector("#find-close");
const zoomOut = document.querySelector("#zoom-out");
const zoomReset = document.querySelector("#zoom-reset");
const zoomIn = document.querySelector("#zoom-in");
let libraryMode = "bookmarks";
let libraryTrigger = null;
let downloadState = [];
let currentState = { tabs: [], activeTabId: null };

function syncChromeOverlay() {
  api.setChromeOverlayOpen(!settingsPanel.hidden || !passwordPanel.hidden || !libraryPanel.hidden);
}

function renderTabs(tabs = []) {
  const preserveTabFocus = Boolean(tabsNode.contains?.(document.activeElement));
  tabsNode.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement("div");
    item.className = "tab" + (tab.active ? " active" : "") + (tab.isPrivate ? " private-tab" : "");
    const select = document.createElement("button");
    select.className = "tab-select";
    select.type = "button";
    select.setAttribute("data-tab-id", String(tab.id));
    select.title = (tab.isPrivate ? "Private tab · " : "") + (tab.url || "New Tab");
    select.setAttribute("role", "tab");
    select.setAttribute("aria-selected", String(tab.active));
    select.textContent = tab.loading && (!tab.title || tab.title === "New Tab") ? "Loading…" : tab.title;
    if (tab.isPrivate) select.setAttribute("aria-label", "Private tab: " + (tab.title || "New Tab"));
    select.addEventListener("click", () => api.activateTab(tab.id));
    const close = document.createElement("button");
    close.className = "tab-close";
    close.type = "button";
    close.title = "Close tab";
    close.setAttribute("aria-label", "Close " + (tab.title || "tab"));
    close.textContent = "×";
    close.addEventListener("click", (event) => { event.stopPropagation(); api.closeTab(tab.id); });
    item.append(select, close);
    tabsNode.append(item);
  }
  if (preserveTabFocus) tabsNode.querySelector('[role="tab"][aria-selected="true"]')?.focus();
}
tabsNode.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabButtons = [...tabsNode.querySelectorAll('[role="tab"]')];
  if (tabButtons.length < 2) return;
  const currentIndex = tabButtons.indexOf(document.activeElement);
  if (currentIndex < 0) return;
  const nextIndex = event.key === "Home" ? 0
    : event.key === "End" ? tabButtons.length - 1
      : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabButtons.length) % tabButtons.length;
  event.preventDefault();
  const nextTab = tabButtons[nextIndex];
  nextTab.focus();
  api.activateTab(Number(nextTab.dataset.tabId));
});
function applyState(state = {}) {
  currentState = { ...currentState, ...state };
  renderTabs(currentState.tabs || []);
  if (typeof state.windowMaximized === "boolean") {
    windowMaximize.textContent = state.windowMaximized ? "❐" : "□";
    windowMaximize.title = state.windowMaximized ? "Restore window" : "Maximize window";
    windowMaximize.setAttribute("aria-label", windowMaximize.title);
  }
  if (typeof state.url === "string" && document.activeElement !== address) address.value = state.url;
  back.disabled = !state.canGoBack;
  forward.disabled = !state.canGoForward;
  reload.textContent = state.loading ? "×" : "↻";
  reload.title = state.loading ? "Stop loading" : "Reload";
  reload.setAttribute("aria-label", reload.title);
  status.textContent = (state.isPrivate ? "Private session · history and tabs are not saved · " : "") + (state.error ? "Load error: " + state.error : state.loading ? "Loading…" : state.title || "Ready");
  retryNavigation.hidden = !state.error;
  retryNavigation.disabled = Boolean(state.loading);
  bookmarkCurrent.disabled = Boolean(state.isPrivate);
  bookmarkCurrent.title = state.isPrivate ? "Bookmarks are disabled in private tabs" : "Bookmark current page";
  document.body.classList.toggle("private-mode", Boolean(state.isPrivate));
  if (state.searchProvider && document.activeElement !== searchProviderSelect) searchProviderSelect.value = state.searchProvider;
  if (state.theme && document.activeElement !== themeSetting) themeSetting.value = state.theme;
  if (state.homePage && document.activeElement !== homepageSetting) homepageSetting.value = state.homePage;
  applyTheme(state.theme || "dark");
  const sitePermissions = Array.isArray(state.sitePermissions) ? state.sitePermissions : [];
  clearSitePermissions.disabled = sitePermissions.length === 0;
  clearSitePermissions.textContent = sitePermissions.length ? `Revoke access (${sitePermissions.length})` : "Site access";
  clearSitePermissions.title = sitePermissions.length
    ? "Revoke this site’s temporary permissions: " + sitePermissions.join(", ")
    : "This site has no temporary permissions";
  zoomReset.textContent = Math.round((state.zoomFactor || 1) * 100) + "%";
  zoomReset.title = "Reset zoom (Ctrl+0)";
  document.title = state.title ? state.title + " · Browser C" : "Browser C";
}
async function submitAddress(event) {
  event.preventDefault();
  const result = await api.navigate(address.value);
  if (!result || !result.ok) status.textContent = result?.error || "Navigation failed";
  else { address.value = result.url; address.blur(); }
}
form.addEventListener("submit", submitAddress);
retryNavigation.addEventListener("click", () => {
  address.value = currentState.url || address.value;
  submitAddress({ preventDefault() {} });
});
back.addEventListener("click", () => api.back());
forward.addEventListener("click", () => api.forward());
reload.addEventListener("click", async () => {
  const state = await api.getState();
  if (state.loading) await api.stop(); else await api.reload();
});
home.addEventListener("click", () => api.home());
newTab.addEventListener("click", () => api.newTab());
newPrivateTab.addEventListener("click", () => api.newPrivateTab());
windowMinimize.addEventListener("click", () => api.minimizeWindow());
windowMaximize.addEventListener("click", () => api.toggleMaximizeWindow());
windowClose.addEventListener("click", () => api.closeWindow());
printPage.addEventListener("click", async () => {
  document.querySelector(".tools-menu").open = false;
  const result = await api.printPage();
  if (!result?.ok && !result?.canceled) status.textContent = result?.error || "Could not print this page.";
});
savePageAs.addEventListener("click", async () => {
  document.querySelector(".tools-menu").open = false;
  const result = await api.savePageAs();
  if (result?.ok) status.textContent = "Webpage saved.";
  else if (!result?.canceled) status.textContent = result?.error || "Could not save this page.";
});
savePagePdf.addEventListener("click", async () => {
  document.querySelector(".tools-menu").open = false;
  const result = await api.savePageAsPdf();
  if (result?.ok) status.textContent = "PDF saved.";
  else if (!result?.canceled) status.textContent = result?.error || "Could not export this page as PDF.";
});
captureScreenshot.addEventListener("click", async () => {
  document.querySelector(".tools-menu").open = false;
  const result = await api.captureScreenshot();
  if (result?.ok) status.textContent = "Screenshot saved.";
  else if (!result?.canceled) status.textContent = result?.error || "Could not capture this page.";
});
translatePage.addEventListener("click", async () => {
  document.querySelector(".tools-menu").open = false;
  const result = await api.translatePage();
  if (result?.ok) status.textContent = "Translation opened in a new tab.";
  else if (!result?.canceled) status.textContent = result?.error || "Could not translate this page.";
});
openDevTools.addEventListener("click", async () => {
  document.querySelector(".tools-menu").open = false;
  const result = await api.openDevTools();
  if (!result?.ok) status.textContent = result?.error || "Could not open developer tools.";
});
zoomOut.addEventListener("click", () => api.changeZoom("out"));
zoomReset.addEventListener("click", () => api.changeZoom("reset"));
zoomIn.addEventListener("click", () => api.changeZoom("in"));
function openFindBar() {
  findBar.hidden = false;
  findQuery.focus();
  findQuery.select();
}
async function searchInPage(next = false) {
  const query = findQuery.value.trim();
  if (!query) { await api.stopFind(); return; }
  const result = next === "previous" ? await api.findPrevious(query) : next ? await api.findNext(query) : await api.findInPage(query);
  if (!result?.ok) status.textContent = result?.error || "Find failed";
}
findQuery.addEventListener("input", () => searchInPage(false));
findQuery.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); searchInPage(true); }
  else if (event.key === "Escape") { event.preventDefault(); findBar.hidden = true; api.stopFind(); }
});
findPrevious.addEventListener("click", () => searchInPage("previous"));
findNext.addEventListener("click", () => searchInPage(true));
findClose.addEventListener("click", () => { findBar.hidden = true; api.stopFind(); });
async function showLibrary(mode, trigger = null) {
  libraryMode = mode;
  if (trigger) libraryTrigger = trigger;
  libraryPanel.hidden = false;
  settingsPanel.hidden = true;
  passwordPanel.hidden = true;
  syncChromeOverlay();
  for (const [trigger, triggerMode] of [[showBookmarks, "bookmarks"], [showHistory, "history"], [showDownloads, "downloads"]]) {
    trigger.setAttribute("aria-expanded", String(mode === triggerMode));
  }
  libraryTitle.textContent = mode === "bookmarks" ? "Bookmarks" : mode === "history" ? "History" : "Downloads";
  closeLibrary.focus();
  clearHistory.hidden = mode !== "history";
  libraryList.replaceChildren();
  const entries = mode === "bookmarks" ? await api.getBookmarks() : mode === "history" ? await api.getHistory() : downloadState;
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.textContent = mode === "bookmarks" ? "No bookmarks yet. Save a page with ☆ Bookmark." : mode === "history" ? "No browsing history yet." : "No completed downloads saved yet.";
    libraryList.append(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "library-entry";
    if (mode === "downloads") {
      const detail = document.createElement("div");
      detail.className = "download-detail";
      const title = document.createElement("strong");
      title.textContent = entry.filename;
      const meta = document.createElement("small");
      const total = entry.totalBytes > 0 ? " / " + formatBytes(entry.totalBytes) : "";
      meta.textContent = entry.state + " · " + formatBytes(entry.receivedBytes) + total;
      detail.append(title, meta);
      row.append(detail);
      if (entry.state === "completed" && entry.savePath) {
        const reveal = document.createElement("button");
        reveal.type = "button";
        reveal.textContent = "Show";
        reveal.title = "Show downloaded file in its folder";
        reveal.setAttribute("aria-label", "Show " + entry.filename + " in folder");
        reveal.addEventListener("click", async () => {
          const result = await api.revealDownload(entry.id);
          if (!result?.ok) status.textContent = result?.error || "Could not reveal download";
        });
        row.append(reveal);
      } else if ((entry.state === "in-progress" || entry.state === "choosing-location") && entry.id) {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "×";
        cancel.title = "Cancel download";
        cancel.setAttribute("aria-label", "Cancel " + entry.filename);
        cancel.addEventListener("click", () => api.cancelDownload(entry.id));
        row.append(cancel);
      }
    } else {
      const open = document.createElement("button");
      open.type = "button";
      const title = document.createElement("span");
      title.textContent = entry.title || entry.url;
      const detail = document.createElement("small");
      detail.textContent = mode === "history" && entry.visitedAt
        ? new Date(entry.visitedAt).toLocaleString() + " · " + entry.url
        : entry.url;
      open.append(title, detail);
      open.addEventListener("click", async () => {
        closeLibraryPanel();
        await api.navigate(entry.url);
      });
      row.append(open);
    }
    libraryList.append(row);
  }
}
bookmarkCurrent.addEventListener("click", async () => {
  if (!currentState.url || !/^https?:\/\//i.test(currentState.url)) return;
  const result = await api.toggleBookmark({ url: currentState.url, title: currentState.title || currentState.url });
  if (result?.ok) {
    bookmarkCurrent.textContent = result.bookmarked ? "★ Saved" : "☆ Bookmark";
    if (!libraryPanel.hidden && libraryMode === "bookmarks") await showLibrary("bookmarks");
  } else status.textContent = result?.error || "Could not update bookmark";
});
showBookmarks.addEventListener("click", () => showLibrary("bookmarks", showBookmarks));
showHistory.addEventListener("click", () => showLibrary("history", showHistory));
showDownloads.addEventListener("click", () => showLibrary("downloads", showDownloads));
function closePasswordPanel() {
  passwordPanel.hidden = true;
  syncChromeOverlay();
  openPasswords.setAttribute("aria-expanded", "false");
  passwordSecret.value = "";
  passwordList.replaceChildren();
  lastPasswordTrigger?.focus();
}
async function renderPasswordVault() {
  passwordList.replaceChildren();
  const result = await api.getPasswords();
  if (!result?.available) {
    passwordVaultNote.textContent = result?.error || "Secure OS-backed encryption is unavailable. Browser C will not store passwords in plaintext. Enable a system keyring and restart the browser.";
    return;
  }
  passwordVaultNote.textContent = "Saved locally using OS-backed encryption. Manual entries only; automatic saving and autofill are not implemented yet.";
  const entries = Array.isArray(result.entries) ? result.entries : [];
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.textContent = "No saved passwords yet.";
    passwordList.append(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "library-entry password-entry";
    const detail = document.createElement("div");
    detail.className = "download-detail";
    const origin = document.createElement("strong");
    origin.textContent = entry.origin;
    const username = document.createElement("small");
    username.textContent = entry.username;
    const secret = document.createElement("input");
    secret.type = "password";
    secret.readOnly = true;
    secret.autocomplete = "off";
    secret.setAttribute("aria-label", "Saved password for " + entry.origin);
    secret.placeholder = "••••••••";
    detail.append(origin, username, secret);
    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.textContent = "Reveal";
    reveal.addEventListener("click", async () => {
      if (secret.type === "text") {
        secret.value = "";
        secret.type = "password";
        reveal.textContent = "Reveal";
        return;
      }
      const revealed = await api.revealPassword(entry.id);
      if (!revealed?.ok) { status.textContent = revealed?.error || "Could not reveal password."; return; }
      secret.value = revealed.password;
      secret.type = "text";
      reveal.textContent = "Hide";
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      const deleted = await api.deletePassword(entry.id);
      if (deleted?.ok) { status.textContent = "Password entry deleted."; await renderPasswordVault(); }
      else status.textContent = deleted?.error || "Could not delete password entry.";
    });
    row.append(detail, reveal, remove);
    passwordList.append(row);
  }
}
openPasswords.addEventListener("click", async () => {
  lastPasswordTrigger = openPasswords;
  settingsPanel.hidden = true;
  libraryPanel.hidden = true;
  passwordPanel.hidden = false;
  syncChromeOverlay();
  openPasswords.setAttribute("aria-expanded", "true");
  passwordSite.value = /^https:\/\//i.test(currentState.url || "") ? currentState.url : "";
  await renderPasswordVault();
  closePasswords.focus();
});
closePasswords.addEventListener("click", closePasswordPanel);
passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await api.savePassword({ url: passwordSite.value.trim(), username: passwordUsername.value.trim(), password: passwordSecret.value });
  if (!result?.ok) { status.textContent = result?.error || "Could not save password."; return; }
  passwordSecret.value = "";
  status.textContent = "Password saved securely.";
  await renderPasswordVault();
});
function applyTheme(theme) {
  if (document.documentElement) document.documentElement.dataset.theme = ["dark", "light", "system"].includes(theme) ? theme : "dark";
}
function closeSettingsPanel() {
  settingsPanel.hidden = true;
  syncChromeOverlay();
  openSettings.setAttribute("aria-expanded", "false");
  lastSettingsTrigger?.focus();
}
openSettings.addEventListener("click", () => {
  lastSettingsTrigger = openSettings;
  passwordPanel.hidden = true;
  libraryPanel.hidden = true;
  settingsPanel.hidden = false;
  syncChromeOverlay();
  openSettings.setAttribute("aria-expanded", "true");
  closeSettings.focus();
});
closeSettings.addEventListener("click", closeSettingsPanel);
settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const provider = searchProviderSelect.value;
  const preferences = { theme: themeSetting.value, homePage: homepageSetting.value.trim() };
  const providerResult = await api.setSearchProvider(provider);
  if (!providerResult?.ok) { status.textContent = providerResult?.error || "Could not save search provider."; return; }
  const result = await api.savePreferences(preferences);
  if (result?.ok) {
    applyTheme(result.theme);
    status.textContent = "Settings saved.";
    closeSettingsPanel();
  } else status.textContent = result?.error || "Could not save settings.";
});
searchProviderSelect.addEventListener("change", async () => {
  const result = await api.setSearchProvider(searchProviderSelect.value);
  if (result?.ok) status.textContent = "Search provider saved. New text searches will use " + searchProviderSelect.options[searchProviderSelect.selectedIndex].text + ".";
  else status.textContent = result?.error || "Could not save search provider.";
});
clearSitePermissions.addEventListener("click", async () => {
  const result = await api.clearSitePermissions();
  if (result?.ok) status.textContent = result.cleared
    ? "Revoked " + result.cleared + " temporary site permission(s)."
    : "This site had no temporary permissions to revoke.";
  else status.textContent = result?.error || "Could not revoke site permissions.";
});
function formatBytes(bytes = 0) {
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return value.toFixed(value >= 100 ? 0 : 1) + " " + units[unit];
}
api.onDownloads((items) => {
  downloadState = items;
  if (!libraryPanel.hidden && libraryMode === "downloads") showLibrary("downloads");
});
api.getDownloads().then((items) => { downloadState = items; }).catch(() => {});
function closeLibraryPanel() {
  libraryPanel.hidden = true;
  syncChromeOverlay();
  for (const trigger of [showBookmarks, showHistory, showDownloads]) {
    trigger.setAttribute("aria-expanded", "false");
  }
  libraryTrigger?.focus();
}
closeLibrary.addEventListener("click", closeLibraryPanel);
clearHistory.addEventListener("click", async () => {
  await api.clearHistory();
  await showLibrary("history");
});

api.onFocusAddress(() => { address.focus(); address.select(); });
api.onFindOpen(openFindBar);
api.onLibraryOpen((mode) => {
  if (mode === "downloads") showLibrary("downloads", showDownloads);
  else if (mode === "history") showLibrary("history", showHistory);
});
function handleEscape(event) {
  if (!findBar.hidden) {
    event.preventDefault();
    findBar.hidden = true;
    api.stopFind();
    return;
  }
  if (passwordPanel && !passwordPanel.hidden) { event.preventDefault(); closePasswordPanel(); return; }
  if (settingsPanel && !settingsPanel.hidden) { event.preventDefault(); closeSettingsPanel(); return; }
  if (!libraryPanel.hidden) {
    event.preventDefault();
    closeLibraryPanel();
  }
}
api.onEscape(() => handleEscape({ preventDefault() {} }));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    handleEscape(event);
    return;
  }
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return;
  const key = event.key.toLowerCase();
  if (key === "n" && event.shiftKey) { event.preventDefault(); api.newPrivateTab(); }
  else if (key === "t") { event.preventDefault(); api.newTab(); }
  else if (key === "w") { event.preventDefault(); api.closeTab(currentState.activeTabId); }
  else if (key === "l") { event.preventDefault(); address.focus(); address.select(); }
  else if (key === "f") { event.preventDefault(); openFindBar(); }
  else if (key === "j") { event.preventDefault(); showLibrary("downloads", showDownloads); }
  else if (key === "h") { event.preventDefault(); showLibrary("history", showHistory); }
  else if (key === "+" || key === "=") { event.preventDefault(); api.changeZoom("in"); }
  else if (key === "-") { event.preventDefault(); api.changeZoom("out"); }
  else if (key === "0") { event.preventDefault(); api.changeZoom("reset"); }
  else if (key === "r") { event.preventDefault(); api.reload(); }
  else if (key === "tab" && currentState.tabs.length > 1) {
    event.preventDefault();
    const index = currentState.tabs.findIndex((tab) => tab.id === currentState.activeTabId);
    const delta = event.shiftKey ? -1 : 1;
    const next = (index + delta + currentState.tabs.length) % currentState.tabs.length;
    api.activateTab(currentState.tabs[next].id);
  }
});
api.onState(applyState);
api.getState().then(applyState).catch(() => { status.textContent = "Browser process unavailable"; });
