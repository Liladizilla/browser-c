const api = window.browserC;
const address = document.querySelector("#address");
const form = document.querySelector("#address-form");
const back = document.querySelector("#back");
const forward = document.querySelector("#forward");
const reload = document.querySelector("#reload");
const home = document.querySelector("#home");
const newTab = document.querySelector("#new-tab");
const tabsNode = document.querySelector("#tabs");
const status = document.querySelector("#status");
const bookmarkCurrent = document.querySelector("#bookmark-current");
const showBookmarks = document.querySelector("#show-bookmarks");
const showHistory = document.querySelector("#show-history");
const libraryPanel = document.querySelector("#library-panel");
const libraryTitle = document.querySelector("#library-title");
const libraryList = document.querySelector("#library-list");
const closeLibrary = document.querySelector("#close-library");
const clearHistory = document.querySelector("#clear-history");
let libraryMode = "bookmarks";
let currentState = { tabs: [], activeTabId: null };

function renderTabs(tabs = []) {
  tabsNode.replaceChildren();
  for (const tab of tabs) {
    const item = document.createElement("div");
    item.className = "tab" + (tab.active ? " active" : "");
    const select = document.createElement("button");
    select.className = "tab-select";
    select.type = "button";
    select.title = tab.url || "New Tab";
    select.setAttribute("role", "tab");
    select.setAttribute("aria-selected", String(tab.active));
    select.textContent = tab.loading && (!tab.title || tab.title === "New Tab") ? "Loading…" : tab.title;
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
function applyState(state = {}) {
  currentState = { ...currentState, ...state };
  renderTabs(currentState.tabs || []);
  if (typeof state.url === "string" && document.activeElement !== address) address.value = state.url;
  back.disabled = !state.canGoBack;
  forward.disabled = !state.canGoForward;
  reload.textContent = state.loading ? "×" : "↻";
  reload.title = state.loading ? "Stop loading" : "Reload";
  reload.setAttribute("aria-label", reload.title);
  status.textContent = state.error ? "Load error: " + state.error : state.loading ? "Loading…" : state.title || "Ready";
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
async function showLibrary(mode) {
  libraryMode = mode;
  libraryPanel.hidden = false;
  libraryTitle.textContent = mode === "bookmarks" ? "Bookmarks" : "History";
  clearHistory.hidden = mode !== "history";
  libraryList.replaceChildren();
  const entries = mode === "bookmarks" ? await api.getBookmarks() : await api.getHistory();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.textContent = mode === "bookmarks" ? "No bookmarks yet. Save a page with ☆ Bookmark." : "No browsing history yet.";
    libraryList.append(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "library-entry";
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
closeLibrary.addEventListener("click", () => { libraryPanel.hidden = true; });
clearHistory.addEventListener("click", async () => {
  await api.clearHistory();
  await showLibrary("history");
});

api.onFocusAddress(() => { address.focus(); address.select(); });
document.addEventListener("keydown", (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier) return;
  const key = event.key.toLowerCase();
  if (key === "t") { event.preventDefault(); api.newTab(); }
  else if (key === "w") { event.preventDefault(); api.closeTab(currentState.activeTabId); }
  else if (key === "l") { event.preventDefault(); address.focus(); address.select(); }
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
