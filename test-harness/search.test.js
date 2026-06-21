"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule, makeWindow } = require("./loader");

function load() {
  const window = makeWindow();
  loadModule("search.js", { window });
  return window.PRH.search;
}

const HAY = "Alpha Beta\nimage\nthe quick brown fox";

function matches(query, haystack = HAY) {
  return load().matchesQuery(haystack, query);
}

test("empty query matches everything", () => {
  assert.equal(matches(""), true);
  assert.equal(matches("   "), true);
});

test("single term is a case-insensitive substring", () => {
  assert.equal(matches("alpha"), true);
  assert.equal(matches("ALPHA"), true);
  assert.equal(matches("zzz"), false);
});

test("implicit AND: every term must be present", () => {
  assert.equal(matches("alpha image"), true);
  assert.equal(matches("alpha missing"), false);
});

test("exclusion: -term must be absent", () => {
  assert.equal(matches("alpha -gamma"), true);
  assert.equal(matches("alpha -image"), false);
});

test("exclusion requires a positive term; exclude-only acts as no filter", () => {
  assert.equal(matches("-image"), true);
  assert.equal(matches("-gamma"), true);
  assert.equal(matches("-image -alpha"), true);
});

test("quoted phrase keeps internal spaces literal", () => {
  assert.equal(matches('"alpha beta"'), true);
  assert.equal(matches('"beta alpha"'), false);
  assert.equal(matches('"quick brown"'), true);
});

test("OR matches either side", () => {
  assert.equal(matches("alpha OR zzz"), true);
  assert.equal(matches("zzz OR image"), true);
  assert.equal(matches("zzz OR qqq"), false);
});

test("pipe is an alias for OR", () => {
  assert.equal(matches("alpha|zzz"), true);
  assert.equal(matches("zzz | qqq"), false);
});

test("OR binds tighter than implicit AND", () => {
  // alpha AND (zzz OR image) -> true; alpha AND (zzz OR qqq) -> false
  assert.equal(matches("alpha zzz OR image"), true);
  assert.equal(matches("alpha zzz OR qqq"), false);
});

test("lowercase or is a literal term, not an operator", () => {
  assert.equal(matches("or", "memory or storage"), true);
  assert.equal(matches("or", HAY), false);
});

test("combines phrase, AND and exclusion", () => {
  assert.equal(matches('"quick brown" alpha -gamma'), true);
  assert.equal(matches('"quick brown" -fox'), false);
});

test("parseQuery groups OR terms and splits AND terms", () => {
  const search = load();
  assert.deepEqual(search.parseQuery("a b OR c -d"), [
    [{ value: "a", exclude: false }],
    [{ value: "b", exclude: false }, { value: "c", exclude: false }],
    [{ value: "d", exclude: true }],
  ]);
});
