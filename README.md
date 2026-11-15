# Patreon Reader

**Export Patreon posts to EPUB for offline reading**

A lightweight browser extension for Chrome and Firefox that captures Patreon post data and lets you export selected posts as an EPUB ebook.

## Features

- Automatically detects posts while browsing a Patreon campaign
- Load more posts on demand
- Search and filter loaded posts
- Select individual posts or all filtered results
- Exports to an **EPUB 3** file

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

## How to Use

1. Visit any Patreon campaign page (creator page with `Recent Posts`)
2. Click the extension's toolbar icon to open the post list
3. (Optional) Click **Load more** and use the search box to filter
4. Select the posts you want to export
5. Click **Export EPUB**

The EPUB file will download automatically.

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
