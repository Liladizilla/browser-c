const SEARCH_URLS = Object.freeze({
  google: "https://www.google.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  bing: "https://www.bing.com/search?q=",
  brave: "https://search.brave.com/search?q="
});

export function resolveAddress(input, searchProvider = "google") {
  const value = String(input ?? "").trim();
  if (!value) return "https://www.google.com/";
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new TypeError("Only HTTP and HTTPS addresses are supported.");
    return url.href;
  }
  if (/^(localhost|127(?:\.\d{1,3}){3})(?::\d+)?(?:\/.*)?$/i.test(value)) return new URL("http://" + value).href;
  if (/^[^\s/]+\.[^\s/]+(?::\d+)?(?:\/.*)?$/.test(value) && !value.includes(" ")) return new URL("https://" + value).href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new TypeError("Only HTTP and HTTPS addresses are supported.");
  const searchUrl = SEARCH_URLS[searchProvider] || SEARCH_URLS.google;
  return searchUrl + encodeURIComponent(value);
}
export function isWebUrl(value) {
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; }
  catch { return false; }
}
