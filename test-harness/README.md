# Test harness (local)

Zero-dependency automated tests for the extension. Uses Node's built-in
`node:test` + `node:assert` — no `npm install` needed.

Sibling of `../extension/` (the loadable extension). It is never bundled into the
Chrome extension because only `extension/` is loaded/packed.

## Run

```bash
cd test-harness && npm test
# or, from the repo root:
node --test test-harness/
```

Requires Node 18+.

## How it works

The extension files are plain IIFEs that attach to a global `window.PRH` and
reference browser globals (`window`, `chrome`, `document`, `fetch`, ...) as free
identifiers. `loader.js` reads each source file and runs it inside a
`new Function(...stubNames)` so those globals can be stubbed. Anything not
stubbed (URL, Map, Set, TextEncoder, JSON, Date, ...) falls through to the real
Node global. This lets the tests exercise the **real, shipped code** — not
copies.

## Coverage

| File | What it tests |
|------|---------------|
| `renderer.test.js` | `escapeHtml`, `formatDate`, content-JSON → XHTML, image registration |
| `api.test.js` | URL matching, response validation, state merge, pagination, dedup |
| `epub.test.js` | Full EPUB export → valid ZIP with expected entries; image fetch/embed |
| `content.test.js` | Popup ↔ content messaging: `GET_STATE`, `SET_SELECTION`, `SELECT_ALL` (accumulates), **`DESELECT_ALL` clears everything**, `LOAD_MORE` pagination (+ operator-aware new-post selection), `EXPORT` |
| `search.test.js` | `search.js` query operators: implicit AND, `-term` exclusion (AND-NOT, never broadens an OR group), `"exact phrase"`, `OR`/`\|` (binds tighter than AND), plus `parseQuery` grouping into `{groups, excludes}` |

`content.test.js` drives the real `chrome.runtime.onMessage` handler and feeds
posts through the page-bridge `window.postMessage` path, so it covers the two
recent changes end to end (popup-only UI + deselect-all clears all). Both
`popup.js` and `content.js` filter through the shared `search.js` module, so the
query operators are tested once in `search.test.js`.

## Not covered (needs a real browser)

`page-bridge.js` fetch/XHR monkey-patching and the actual file download. For
those, drive the unpacked extension with Playwright/Puppeteer (`--load-extension`).
