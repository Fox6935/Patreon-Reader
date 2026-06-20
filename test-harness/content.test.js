"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  loadModule,
  makeWindow,
  makeChrome,
  makeDocument,
  callMessageHandler,
  noopMutationObserver,
} = require("./loader");
const fixtures = require("./fixtures");

const POSTS_URL = "https://www.patreon.com/api/posts?json-api-version=1.0";

function setup() {
  const window = makeWindow();
  const chrome = makeChrome();
  const location = { href: "https://www.patreon.com/c/testcreator/posts" };

  const fetchQueue = [];
  const fetch = async () => {
    if (!fetchQueue.length) throw new Error("no queued fetch response");
    const json = fetchQueue.shift();
    return { ok: true, status: 200, json: async () => json };
  };

  loadModule("renderer.js", { window });
  loadModule("patreon-api.js", { window, location });

  // Only the EXPORT test reaches epub; the rest never invoke these download stubs.
  const URLStub = Object.assign(function (...a) {
    return new globalThis.URL(...a);
  }, { createObjectURL: () => "blob:test", revokeObjectURL: () => {} });
  loadModule("epub.js", {
    window,
    document: makeDocument(),
    URL: URLStub,
    fetch: async () => { throw new Error("epub fetch not expected"); },
    crypto: { randomUUID: require("crypto").randomUUID },
    setTimeout: () => 0,
  });

  loadModule("content.js", {
    window,
    chrome,
    location,
    history: { pushState() {}, replaceState() {} },
    document: makeDocument(),
    MutationObserver: noopMutationObserver,
    fetch,
    setTimeout: () => 0,
    console,
  });

  // Simulate the page bridge delivering an /api/posts response.
  const feed = (response) =>
    window.postMessage({
      source: "PRH_PAGE_BRIDGE",
      type: "PRH_POSTS_RESPONSE",
      url: POSTS_URL,
      text: JSON.stringify(response),
    });

  const send = (message) => callMessageHandler(chrome, message);

  return { window, chrome, feed, send, fetchQueue };
}

test("GET_STATE reflects ingested posts (all selected by default)", async () => {
  const { feed, send } = setup();
  feed(fixtures.page1);

  const snap = await send({ type: "GET_STATE" });
  assert.equal(snap.active, true);
  assert.equal(snap.posts.length, 3);
  assert.equal(snap.selectedIds.length, 3);
  assert.equal(snap.totalPosts, 5);
  assert.equal(snap.canLoadMore, true);
  assert.equal(snap.creatorName, "Test Creator");
  assert.deepEqual(Object.keys(snap.posts[0]).sort(), [
    "content_teaser_text", "id", "patreon_url", "post_type",
    "published_at", "title", "url",
  ]);
});

test("duplicate bridge payloads are ignored", async () => {
  const { feed, send } = setup();
  feed(fixtures.page1);
  feed(fixtures.page1);
  const snap = await send({ type: "GET_STATE" });
  assert.equal(snap.posts.length, 3);
});

test("DESELECT_ALL clears the entire selection (Change A)", async () => {
  const { feed, send } = setup();
  feed(fixtures.page1);

  let snap = await send({ type: "DESELECT_ALL" });
  assert.equal(snap.selectedIds.length, 0);
});

test("SELECT_ALL adds exactly the supplied ids; SET_SELECTION toggles one", async () => {
  const { feed, send } = setup();
  feed(fixtures.page1);
  await send({ type: "DESELECT_ALL" });

  let snap = await send({ type: "SELECT_ALL", ids: ["101", "103"] });
  assert.deepEqual(snap.selectedIds.sort(), ["101", "103"]);

  snap = await send({ type: "SET_SELECTION", id: "102", checked: true });
  assert.deepEqual(snap.selectedIds.sort(), ["101", "102", "103"]);

  snap = await send({ type: "SET_SELECTION", id: "101", checked: false });
  assert.deepEqual(snap.selectedIds.sort(), ["102", "103"]);
});

test("SELECT_ALL accumulates across searches (does not reset)", async () => {
  const { feed, send } = setup();
  feed(fixtures.page1);
  await send({ type: "DESELECT_ALL" });

  await send({ type: "SELECT_ALL", ids: ["101"] }); // first search's matches
  const snap = await send({ type: "SELECT_ALL", ids: ["103"] }); // second search's matches
  assert.deepEqual(snap.selectedIds.sort(), ["101", "103"]);
});

test("LOAD_MORE fetches the next page and clears canLoadMore", async () => {
  const { feed, send, fetchQueue } = setup();
  feed(fixtures.page1);
  fetchQueue.push(fixtures.page2);

  const snap = await send({ type: "LOAD_MORE" });
  assert.equal(snap.posts.length, 5);
  assert.equal(snap.canLoadMore, false);
});

test("LOAD_MORE with a search only selects newly loaded matching posts", async () => {
  const { feed, send, fetchQueue } = setup();
  feed(fixtures.page1);

  // Reproduce the reported flow: search, deselect all, select matching, load more.
  await send({ type: "DESELECT_ALL" });
  await send({ type: "SELECT_ALL", ids: ["102"] });

  fetchQueue.push(fixtures.page2);
  const snap = await send({ type: "LOAD_MORE", filterText: "delta" });

  assert.equal(snap.posts.length, 5);
  assert.deepEqual(snap.selectedIds.sort(), ["102", "104"]);
});

test("LOAD_MORE with no search selects all newly loaded posts", async () => {
  const { feed, send, fetchQueue } = setup();
  feed(fixtures.page1);
  await send({ type: "DESELECT_ALL" });

  fetchQueue.push(fixtures.page2);
  const snap = await send({ type: "LOAD_MORE", filterText: "" });
  // Empty filter preserves the default-select-all behavior for newly loaded posts.
  assert.deepEqual(snap.selectedIds.sort(), ["104", "105"]);
});

test("EXPORT returns error when nothing selected, ok when posts selected", async () => {
  const { feed, send } = setup();
  feed(fixtures.page1);

  await send({ type: "DESELECT_ALL" });
  const empty = await send({ type: "EXPORT" });
  assert.equal(empty.error, "No posts selected.");

  await send({ type: "SELECT_ALL", ids: ["101", "102"] });
  const ok = await send({ type: "EXPORT" });
  assert.deepEqual(ok, { ok: true, count: 2 });
});
