"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule, makeWindow, makeDocument } = require("./loader");
const fixtures = require("./fixtures");

function setup({ fetchImpl } = {}) {
  const window = makeWindow();
  const location = { href: "https://www.patreon.com/c/testcreator/posts" };

  loadModule("renderer.js", { window });
  const api = loadModule("patreon-api.js", { window, location }).api;

  const captured = {};
  const URLStub = function (...a) {
    return new globalThis.URL(...a);
  };
  URLStub.createObjectURL = (blob) => {
    captured.blob = blob;
    return "blob:test";
  };
  URLStub.revokeObjectURL = () => {};

  const fetchCalls = [];
  const fetch = async (url, opts) => {
    fetchCalls.push({ url, opts });
    if (fetchImpl) return fetchImpl(url, opts);
    throw new Error("unexpected fetch: " + url);
  };

  const epub = loadModule("epub.js", {
    window,
    document: makeDocument(),
    URL: URLStub,
    fetch,
    crypto: { randomUUID: require("crypto").randomUUID },
    setTimeout: () => 0, // suppress the 30s revoke timer so the test exits promptly
  }).epub;

  return { window, api, epub, captured, fetchCalls };
}

async function zipText(captured) {
  const buf = Buffer.from(await captured.blob.arrayBuffer());
  assert.equal(buf[0], 0x50, "ZIP must start with 'P'");
  assert.equal(buf[1], 0x4b, "ZIP must start with 'K'");
  return buf.toString("latin1");
}

test("exportSelectedPostsAsEpub builds a valid EPUB archive", async () => {
  const { api, epub, captured } = setup();
  const state = freshState();
  api.mergePostsResponseIntoState(state, fixtures.page1);

  await epub.exportSelectedPostsAsEpub(state, state.loadedPosts, () => {});

  const text = await zipText(captured);
  assert.match(text, /application\/epub\+zip/);
  assert.match(text, /META-INF\/container\.xml/);
  assert.match(text, /OEBPS\/content\.opf/);
  assert.match(text, /OEBPS\/nav\.xhtml/);
  assert.match(text, /OEBPS\/toc\.ncx/);
  // Chapter bodies are stored uncompressed, so titles appear verbatim.
  assert.match(text, /Alpha post/);
  assert.match(text, /Gamma update/);
});

test("export throws when nothing is selected", async () => {
  const { epub } = setup();
  await assert.rejects(() => epub.exportSelectedPostsAsEpub({}, []), /No posts selected/);
});

test("images are fetched and embedded into the archive", async () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const { api, epub, captured, fetchCalls } = setup({
    fetchImpl: async () => ({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => pngBytes.buffer,
    }),
  });
  const state = freshState();
  api.mergePostsResponseIntoState(state, fixtures.imageResponse);

  await epub.exportSelectedPostsAsEpub(state, state.loadedPosts, () => {});

  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /test-image\.png/);
  const text = await zipText(captured);
  assert.match(text, /OEBPS\/images\//);
});

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
