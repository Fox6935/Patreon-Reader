"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadModule, makeWindow } = require("./loader");

function loadRenderer() {
  const window = makeWindow();
  return loadModule("renderer.js", { window }).renderer;
}

test("escapeHtml escapes XML-significant characters", () => {
  const r = loadRenderer();
  assert.equal(r.escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

test("escapeHtml strips invalid XML control chars", () => {
  const r = loadRenderer();
  // A bare control char (0x07) is not valid XML and must be dropped.
  assert.equal(r.escapeHtml("ab\x07cd"), "abcd");
});

test("formatDate normalizes ISO to YYYY-MM-DD", () => {
  const r = loadRenderer();
  assert.equal(r.formatDate("2026-01-15T10:00:00.000+00:00"), "2026-01-15");
  assert.equal(r.formatDate(""), "");
});

test("contentJsonStringToHtml renders rich text marks", () => {
  const r = loadRenderer();
  const state = { includedByKey: new Map() };
  const doc = JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "plain " },
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
        ],
      },
    ],
  });
  const html = r.contentJsonStringToHtml(state, doc, { id: "1" }, null);
  assert.match(html, /plain /);
  assert.match(html, /<strong>bold<\/strong>/);
});

test("contentJsonStringToHtml falls back to escaped text on bad JSON", () => {
  const r = loadRenderer();
  const state = { includedByKey: new Map() };
  const html = r.contentJsonStringToHtml(state, "not json <x>", { id: "1" }, null);
  assert.match(html, /not json &lt;x&gt;/);
});

test("image node registers in the render context", () => {
  const r = loadRenderer();
  const state = { includedByKey: new Map() };
  const post = { id: "1" };
  const context = r.buildImageRenderContext(state, post);
  const doc = JSON.stringify({
    type: "doc",
    content: [{ type: "image", attrs: { src: "https://x/img.png", alt: "a" } }],
  });
  const html = r.contentJsonStringToHtml(state, doc, post, context);
  assert.equal(context.images.length, 1);
  assert.equal(context.images[0].sourceUrl, "https://x/img.png");
  assert.match(html, /<figure/);
});
