export function isPrivateTab(tab) {
  return Boolean(tab?.isPrivate);
}

export function persistableTabs(tabs, isWebUrl, limit = 20) {
  return tabs.filter((tab) => !isPrivateTab(tab) && isWebUrl(tab.url)).slice(0, limit);
}

export function shouldRecordHistory(tab, isWebUrl) {
  return Boolean(tab && !isPrivateTab(tab) && isWebUrl(tab.url));
}

export function shouldPersistCompletedDownload(download) {
  return Boolean(download && !download.isPrivate && download.state === "completed"
    && typeof download.savePath === "string");
}

export function shouldCancelDownloadOnTabClose(download) {
  return Boolean(download && ["choosing-location", "in-progress"].includes(download.state));
}

export function canBookmarkTab(tab) {
  return Boolean(tab && !isPrivateTab(tab));
}
