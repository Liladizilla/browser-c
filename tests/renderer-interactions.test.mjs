import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const rendererSource = await readFile(new URL("../src/renderer/renderer.js", import.meta.url), "utf8");

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.handlers = new Map();
    this.attributes = {};
    this.className = "";
    this.classList = {
      values: new Set(),
      toggle: (name, enabled) => enabled ? this.classList.values.add(name) : this.classList.values.delete(name),
      contains: (name) => this.classList.values.has(name)
    };
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.title = "";
  }
  addEventListener(type, callback) {
    const callbacks = this.handlers.get(type) || [];
    callbacks.push(callback);
    this.handlers.set(type, callbacks);
  }
  async fire(type, event = {}) {
    let result;
    for (const callback of this.handlers.get(type) || []) result = await callback({
      preventDefault() {},
      stopPropagation() {},
      key: "",
      ...event
    });
    return result;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  blur() { this.blurred = true; }
}

function createHarness() {
  const elements = new Map();
  const apiCalls = [];
  const apiListeners = {};
  const api = new Proxy({}, {
    get(_target, key) {
      if (key === "onState" || key === "onDownloads" || key === "onFocusAddress" || key === "onFindOpen" || key === "onLibraryOpen" || key === "onEscape") {
        return (callback) => { apiListeners[key] = callback; };
      }
      if (key === "getState") return async () => ({ tabs: [], activeTabId: null, url: "", title: "Ready", loading: false, canGoBack: false, canGoForward: false, zoomFactor: 1 });
      if (key === "getDownloads" || key === "getBookmarks" || key === "getHistory") return async () => [];
      return async (...args) => {
        apiCalls.push({ name: key, args });
        if (key === "navigate") return { ok: true, url: args[0] };
        if (key === "findInPage" || key === "findNext" || key === "findPrevious" || key === "stopFind") return { ok: true };
        if (key === "toggleBookmark") return { ok: true, bookmarked: true };
        return { ok: true };
      };
    }
  });
  const document = {
    body: new FakeElement("body"),
    activeElement: null,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, new FakeElement(selector));
      return elements.get(selector);
    },
    createElement(tagName) { return new FakeElement(tagName); },
    addEventListener(type, callback) {
      const callbacks = this.handlers?.get(type) || [];
      callbacks.push(callback);
      this.handlers ??= new Map();
      this.handlers.set(type, callbacks);
    }
  };
  vm.runInNewContext(rendererSource, { window: { browserC: api }, document, console, Date });
  return { elements, apiCalls, apiListeners, document };
}

test("address form submits input through the navigation bridge", async () => {
  const h = createHarness();
  const address = h.elements.get("#address");
  address.value = "https://example.com/";
  await h.elements.get("#address-form").fire("submit");
  assert.deepEqual(h.apiCalls.find((call) => call.name === "navigate")?.args, ["https://example.com/"]);
  assert.equal(address.value, "https://example.com/");
  assert.equal(address.blurred, true);
});

test("private tab state is visible, accessible, and disables bookmarking", () => {
  const h = createHarness();
  h.apiListeners.onState({
    tabs: [{ id: 2, title: "Private page", url: "https://example.com/", active: true, isPrivate: true }],
    activeTabId: 2,
    url: "https://example.com/",
    title: "Private page",
    isPrivate: true,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    zoomFactor: 1
  });
  const tabs = h.elements.get("#tabs");
  assert.equal(tabs.children.length, 1);
  assert.match(tabs.children[0].className, /private-tab/);
  assert.equal(tabs.children[0].children[0].getAttribute("aria-label"), "Private tab: Private page");
  assert.equal(h.elements.get("#bookmark-current").disabled, true);
  assert.match(h.elements.get("#status").textContent, /history and tabs are not saved/);
  assert.equal(h.document.body.classList.contains("private-mode"), true);
});

test("tab selection invokes activation for the selected tab", async () => {
  const h = createHarness();
  h.apiListeners.onState({
    tabs: [{ id: 7, title: "Example", url: "https://example.com/", active: false, isPrivate: false }],
    activeTabId: 3,
    url: "https://other.example/",
    title: "Other",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    zoomFactor: 1
  });
  await h.elements.get("#tabs").children[0].children[0].fire("click");
  assert.deepEqual(h.apiCalls.find((call) => call.name === "activateTab")?.args, [7]);
});

test("find-in-page Enter advances matches and Escape clears the search", async () => {
  const h = createHarness();
  const query = h.elements.get("#find-query");
  const bar = h.elements.get("#find-bar");
  query.value = "browser";
  await query.fire("keydown", { key: "Enter" });
  assert.deepEqual(h.apiCalls.find((call) => call.name === "findNext")?.args, ["browser"]);
  await query.fire("keydown", { key: "Escape" });
  assert.equal(bar.hidden, true);
  assert.ok(h.apiCalls.some((call) => call.name === "stopFind"));
});


test("Ctrl+J and Ctrl+H open downloads and history panels", async () => {
  const h = createHarness();
  const handlers = h.document.handlers.get("keydown");
  await handlers[0]({ key: "j", ctrlKey: true, metaKey: false, shiftKey: false, preventDefault() { this.prevented = true; } });
  assert.equal(h.elements.get("#library-panel").hidden, false);
  assert.equal(h.elements.get("#library-title").textContent, "Downloads");
  await handlers[0]({ key: "h", ctrlKey: true, metaKey: false, shiftKey: false, preventDefault() { this.prevented = true; } });
  assert.equal(h.elements.get("#library-title").textContent, "History");
});

test("Escape closes the library panel and restores focus to its trigger", async () => {
  const h = createHarness();
  h.elements.get("#find-bar").hidden = true;
  const trigger = h.elements.get("#show-history");
  await trigger.fire("click");
  const event = { key: "Escape", ctrlKey: false, metaKey: false, preventDefault() { this.prevented = true; } };
  h.document.handlers.get("keydown")[0](event);
  assert.equal(h.elements.get("#library-panel").hidden, true);
  assert.equal(trigger.focused, true);
  assert.equal(event.prevented, true);
});


test("library shortcuts from web content open the requested panel", async () => {
  const h = createHarness();
  await h.apiListeners.onLibraryOpen("downloads");
  assert.equal(h.elements.get("#library-title").textContent, "Downloads");
  await h.apiListeners.onLibraryOpen("history");
  assert.equal(h.elements.get("#library-title").textContent, "History");
});

test("Escape relayed from web content closes library and restores focus", async () => {
  const h = createHarness();
  h.elements.get("#find-bar").hidden = true;
  const trigger = h.elements.get("#show-downloads");
  await trigger.fire("click");
  h.apiListeners.onEscape();
  assert.equal(h.elements.get("#library-panel").hidden, true);
  assert.equal(trigger.focused, true);
});
