const api = window.browserC;
const address = document.querySelector("#address");
const form = document.querySelector("#address-form");
const back = document.querySelector("#back");
const forward = document.querySelector("#forward");
const reload = document.querySelector("#reload");
const home = document.querySelector("#home");
const newTab = document.querySelector("#new-tab");
const newPrivateTab = document.querySelector("#new-private-tab");
const tabsNode = document.querySelector("#tabs");
const status = document.querySelector("#status");
const bookmarkCurrent = document.querySelector("#bookmark-current");
const showBookmarks = document.querySelector("#show-bookmarks");
const showHistory = document.querySelector("#show-history");
const showDownloads = document.querySelector("#show-downloads");
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
let downloadState = [];
let currentState = { tabs: [], activeTabId: null };

function renderTabs(tabs = []) {
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
  if (typeof state.url === "string" && document.activeElement !== address) address.value = state.url;
  back.disabled = !state.canGoBack;
  forward.disabled = !state.canGoForward;
  reload.textContent = state.loading ? "×" : "↻";
  reload.title = state.loading ? "Stop loading" : "Reload";
  reload.setAttribute("aria-label", reload.title);
  status.textContent = (state.isPrivate ? "Private session · history and tabs are not saved · " : "") + (state.error ? "Load error: " + state.error : state.loading ? "Loading…" : state.title || "Ready");
  bookmarkCurrent.disabled = Boolean(state.isPrivate);
  bookmarkCurrent.title = state.isPrivate ? "Bookmarks are disabled in private tabs" : "Bookmark current page";
  document.body.classList.toggle("private-mode", Boolean(state.isPrivate));
  zoomReset.textContent = Math.round((state.zoomFactor || 1) * 100) + "%";
  zoomReset.title = "Reset zoom (Ctrl+0)";
  document.title = state.title ? state.title + " · Browser C" : "Browser C";
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await api.navigate(address.value);
  if (!result || !result.ok) status.textContent = result?.error || "Navigation failed";
  else { address.value = result.url; address.blur(); }
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
async function showLibrary(mode) {
  libraryMode = mode;
  libraryPanel.hidden = false;
  libraryTitle.textContent = mode === "bookmarks" ? "Bookmarks" : mode === "history" ? "History" : "Downloads";
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
        libraryPanel.hidden = true;
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
showBookmarks.addEventListener("click", () => showLibrary("bookmarks"));
showHistory.addEventListener("click", () => showLibrary("history"));
showDownloads.addEventListener("click", () => showLibrary("downloads"));
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
closeLibrary.addEventListener("click", () => { libraryPanel.hidden = true; });
clearHistory.addEventListener("click", async () => {
  await api.clearHistory();
  await showLibrary("history");
});

api.onFocusAddress(() => { address.focus(); address.select(); });
api.onFindOpen(openFindBar);
document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return;
  const key = event.key.toLowerCase();
  if (key === "n" && event.shiftKey) { event.preventDefault(); api.newPrivateTab(); }
  else if (key === "t") { event.preventDefault(); api.newTab(); }
  else if (key === "w") { event.preventDefault(); api.closeTab(currentState.activeTabId); }
  else if (key === "l") { event.preventDefault(); address.focus(); address.select(); }
  else if (key === "f") { event.preventDefault(); openFindBar(); }
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
