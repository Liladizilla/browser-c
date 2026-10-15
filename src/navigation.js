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

const NAVIGATION_ERROR_MESSAGES = Object.freeze({
  ERR_CERT_COMMON_NAME_INVALID: "The site's certificate does not match this address. Browser C blocked the connection.",
  ERR_CERT_DATE_INVALID: "The site's security certificate is expired or not yet valid. Browser C blocked the connection.",
  ERR_CERT_AUTHORITY_INVALID: "The site's security certificate is not trusted. Browser C blocked the connection.",
  ERR_CERT_REVOKED: "The site's security certificate has been revoked. Browser C blocked the connection.",
  ERR_CERT_INVALID: "The site's security certificate is invalid. Browser C blocked the connection.",
  ERR_INTERNET_DISCONNECTED: "You appear to be offline. Check your network connection and try again.",
  ERR_NAME_NOT_RESOLVED: "The website address could not be found. Check the address or your network connection.",
  ERR_CONNECTION_REFUSED: "The website refused the connection. It may be offline or blocking connections."
});

export function navigationErrorMessage(code, description = "") {
  const numericCode = Number(code);
  const raw = String(description || "");
  const match = /ERR_[A-Z0-9_]+/.exec(raw);
  const errorCode = match?.[0];
  if (errorCode && NAVIGATION_ERROR_MESSAGES[errorCode]) return NAVIGATION_ERROR_MESSAGES[errorCode];
  if ([-200, -201, -202, -203, -206, -207].includes(numericCode)) {
    return "The site's security certificate could not be verified. Browser C blocked the connection.";
  }
  if (numericCode === -106 || errorCode === "ERR_INTERNET_DISCONNECTED") {
    return NAVIGATION_ERROR_MESSAGES.ERR_INTERNET_DISCONNECTED;
  }
  return raw || "The page could not be loaded. Check the address and your network connection.";
}
