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
4. Click **Load unpacked** and select the folder containing `manifest.json`

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file

## How to Use

1. Visit any Patreon campaign page (creator page with `Recent Posts`)
2. A small bar will appear at the top once posts are loaded
3. Click **Download posts**
4. (Optional) Click **Load more** and use the search box to filter
5. Select the posts you want to export
6. Click **Export EPUB**

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
