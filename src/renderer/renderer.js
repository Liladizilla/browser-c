const api = window.browserC;
const address = document.querySelector("#address");
const form = document.querySelector("#address-form");
const back = document.querySelector("#back");
const forward = document.querySelector("#forward");
const reload = document.querySelector("#reload");
const home = document.querySelector("#home");
const status = document.querySelector("#status");

function applyState(state = {}) {
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
  if (!result || !result.ok) status.textContent = result && result.error ? result.error : "Navigation failed";
});
back.addEventListener("click", () => api.back());
forward.addEventListener("click", () => api.forward());
reload.addEventListener("click", async () => {
  const state = await api.getState();
  if (state.loading) await api.stop();
  else await api.reload();
});
home.addEventListener("click", () => api.home());
api.onState(applyState);
api.getState().then(applyState).catch(() => { status.textContent = "Browser process unavailable"; });
