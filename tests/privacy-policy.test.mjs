import test from "node:test";
import assert from "node:assert/strict";
import {
  canBookmarkTab,
  isPrivateTab,
  persistableTabs,
  shouldCancelDownloadOnTabClose,
  shouldPersistCompletedDownload,
  shouldRecordHistory
} from "../src/privacy-policy.js";
import { isWebUrl } from "../src/navigation.js";

test("private tabs are excluded from session persistence, even when their URLs are valid", () => {
  const tabs = [
    { id: 1, url: "https://example.com", isPrivate: false },
    { id: 2, url: "https://private.example/secret", isPrivate: true },
    { id: 3, url: "file:///tmp/local.html", isPrivate: false },
    { id: 4, url: "https://another.example", isPrivate: false }
  ];
  assert.deepEqual(persistableTabs(tabs, isWebUrl, 1).map((tab) => tab.id), [1]);
  assert.deepEqual(persistableTabs(tabs, isWebUrl).map((tab) => tab.id), [1, 4]);
});

test("private tabs never add URLs to persistent browsing history", () => {
  assert.equal(shouldRecordHistory({ isPrivate: true, url: "https://example.com/secret" }, isWebUrl), false);
  assert.equal(shouldRecordHistory({ isPrivate: false, url: "https://example.com" }, isWebUrl), true);
  assert.equal(shouldRecordHistory({ isPrivate: false, url: "file:///tmp/secret" }, isWebUrl), false);
  assert.equal(shouldRecordHistory(null, isWebUrl), false);
});

test("private tabs cannot be bookmarked", () => {
  assert.equal(isPrivateTab({ isPrivate: true }), true);
  assert.equal(canBookmarkTab({ isPrivate: true }), false);
  assert.equal(canBookmarkTab({ isPrivate: false }), true);
  assert.equal(canBookmarkTab(null), false);
});

test("only completed non-private downloads with a save path can be persisted", () => {
  const base = { state: "completed", savePath: "/downloads/report.pdf" };
  assert.equal(shouldPersistCompletedDownload({ ...base, isPrivate: true }), false);
  assert.equal(shouldPersistCompletedDownload({ ...base, isPrivate: false }), true);
  assert.equal(shouldPersistCompletedDownload({ ...base, isPrivate: false, state: "in-progress" }), false);
  assert.equal(shouldPersistCompletedDownload({ ...base, isPrivate: false, savePath: null }), false);
  assert.equal(shouldPersistCompletedDownload({ ...base, isPrivate: false, savePath: "" }), false);
  assert.equal(shouldPersistCompletedDownload({ ...base, isPrivate: false, savePath: "   " }), false);
  assert.equal(shouldPersistCompletedDownload({ ...base, savePath: "/downloads/report.pdf" }), false,
    "unknown privacy state must fail closed");
});

test("closing a private tab cancels only downloads that are still active", () => {
  assert.equal(shouldCancelDownloadOnTabClose({ state: "choosing-location" }), true);
  assert.equal(shouldCancelDownloadOnTabClose({ state: "in-progress" }), true);
  for (const state of ["completed", "cancelled", "interrupted"]) {
    assert.equal(shouldCancelDownloadOnTabClose({ state }), false);
  }
  assert.equal(shouldCancelDownloadOnTabClose(null), false);
});
