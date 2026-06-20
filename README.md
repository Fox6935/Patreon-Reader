# Patreon Reader

**Export Patreon posts to EPUB for offline reading**

A lightweight browser extension for Chrome and Firefox that captures Patreon post data and lets you export selected posts as an EPUB ebook.

## Features

- Automatically detects posts while browsing a Patreon campaign — no buttons injected into the page
- Open the post list from the extension's toolbar icon
- Load more posts on demand
- Search and filter loaded posts
- Select all filtered results (accumulates across searches) or deselect everything at once
- Exports to an **EPUB 3** file

## Repository layout

- **`extension/`** — the extension itself (this is what you load/pack). Nothing
  else ships in the build.
- **`test-harness/`** — local automated tests (Node, zero-dependency). Never
  bundled. See [test-harness/README.md](test-harness/README.md).

## Installation

### Chrome / Edge / Brave

1. Download or clone this repository
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the **`extension/`** folder

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select **`extension/manifest.json`**

## Testing

```bash
node --test test-harness/
```

Requires Node 18+. No install step.

## How to Use

1. Visit any Patreon creator's posts page and scroll so posts load
2. Click the **Patreon Reader** toolbar icon to open the post list
3. (Optional) Use the search box to filter, and **Load more** to fetch older posts
4. Tick the posts you want — or **Select all** / **Deselect all**
5. Click **Export EPUB**

The EPUB file will download automatically. Tip: pin the extension (puzzle-piece
menu) so the icon is always visible. When a search is active, **Select all** and
**Load more** only select posts matching the search.

## Supported Content

- Full rich text posts
- Images (automatically downloaded and embedded)
- Polls

## Notes

- Must be subscribed to the creator and unlocked the posts.
- All processing happens locally in your browser — nothing is uploaded
- Images are fetched from Patreon’s CDN

## License

MIT License

---

**Made for patrons who want their favorite creators' content available offline.**
