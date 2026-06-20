"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule, makeWindow } = require("./loader");
const fixtures = require("./fixtures");

function loadApi() {
  const window = makeWindow();
  const location = { href: "https://www.patreon.com/c/testcreator/posts" };
  return loadModule("patreon-api.js", { window, location }).api;
}

function freshState() {
  return {
    campaignId: null,
    creatorName: null,
    loadedPosts: [],
    postsById: new Map(),
    selectedPostIds: new Set(),
    totalPosts: 0,
    nextUrl: null,
    includedByKey: new Map(),
  };
}

test("isPostsApiUrl matches only the posts index endpoint", () => {
  const api = loadApi();
  assert.ok(
    api.isPostsApiUrl("https://www.patreon.com/api/posts?json-api-version=1.0"),
  );
  assert.ok(!api.isPostsApiUrl("https://www.patreon.com/api/posts"));
  assert.ok(!api.isPostsApiUrl("https://evil.com/api/posts?json-api-version=1.0"));
  assert.ok(!api.isPostsApiUrl(42));
});

test("isPostsIndexResponse requires post data + pagination signal", () => {
  const api = loadApi();
  assert.ok(api.isPostsIndexResponse(fixtures.page1));
  assert.ok(!api.isPostsIndexResponse({ data: [{ type: "comment" }], links: { next: "x" } }));
  assert.ok(!api.isPostsIndexResponse({ data: [{ type: "post" }] })); // no pagination
});

test("mergePostsResponseIntoState ingests posts, campaign, pagination", () => {
  const api = loadApi();
  const state = freshState();
  const result = api.mergePostsResponseIntoState(state, fixtures.page1);

  assert.equal(result.postsAdded, 3);
  assert.equal(state.loadedPosts.length, 3);
  assert.equal(state.campaignId, "camp-1");
  assert.equal(state.creatorName, "Test Creator");
  assert.equal(state.totalPosts, 5);
  assert.match(state.nextUrl, /page=2/);
  // Selection is the caller's job (content.js), not the merge step.
  assert.equal(state.selectedPostIds.size, 0);
});

test("second page merges without duplicates and clears nextUrl", () => {
  const api = loadApi();
  const state = freshState();
  api.mergePostsResponseIntoState(state, fixtures.page1);
  api.mergePostsResponseIntoState(state, fixtures.page2);

  assert.equal(state.loadedPosts.length, 5);
  assert.equal(state.nextUrl, null);

  // Re-merging page 1 adds nothing.
  const again = api.mergePostsResponseIntoState(state, fixtures.page1);
  assert.equal(again.postsAdded, 0);
  assert.equal(state.loadedPosts.length, 5);
});

test("findPostsInResponse dedupes nested posts by id", () => {
  const api = loadApi();
  const found = api.findPostsInResponse(fixtures.page1);
  assert.equal(found.length, 3);
});
