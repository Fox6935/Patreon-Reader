(() => {
  const root = (window.PRH = window.PRH || {});
  const {
    escapeHtml,
    buildImageRenderContext,
    contentJsonStringToHtml,
    formatDate,
  } = root.renderer;

  const IMAGE_CONTEXTS = new WeakMap();

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);

    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }

    return table;
  })();

  function toUint8Array(value) {
    if (value instanceof Uint8Array) {
      return value;
    }

    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }

    return new Uint8Array(value);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;

    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
  }

  function fileSafeName(str) {
    return String(str || "Posts Export")
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  function slugifyTitle(title) {
    return (
      String(title || "post")
        .replace(/[\x00-\x1f\x7f]/g, " ")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "post"
    );
  }

  function makeUniqueChapterFileName(title, usedNames) {
    const base = slugifyTitle(title);
    let candidate = `${base}.xhtml`;
    let n = 2;

    while (usedNames.has(candidate)) {
      candidate = `${base}-${n}.xhtml`;
      n += 1;
    }

    usedNames.add(candidate);
    return candidate;
  }

  async function fetchImageResource(url) {
    const res = await fetch(url, {
      credentials: "omit",
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const contentType = (res.headers.get("content-type") || "").split(";")[0];
    const buffer = await res.arrayBuffer();

    return {
      bytes: buffer,
      contentType,
    };
  }

  function inferMediaType(url, contentType) {
    if (contentType && contentType.startsWith("image/")) {
      return contentType;
    }

    try {
      const pathname = new URL(url).pathname.toLowerCase();

      if (pathname.endsWith(".png")) {
        return "image/png";
      }

      if (pathname.endsWith(".gif")) {
        return "image/gif";
      }

      if (pathname.endsWith(".webp")) {
        return "image/webp";
      }

      if (pathname.endsWith(".svg")) {
        return "image/svg+xml";
      }

      if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
        return "image/jpeg";
      }
    } catch {}

    if (url.includes(".png")) {
      return "image/png";
    }

    return "image/jpeg";
  }

  function extensionForMediaType(mediaType) {
    switch (mediaType) {
      case "image/png":
        return "png";
      case "image/gif":
        return "gif";
      case "image/webp":
        return "webp";
      case "image/svg+xml":
        return "svg";
      case "image/jpeg":
      default:
        return "jpg";
    }
  }

  function getDosDateTime(date = new Date()) {
    let year = date.getFullYear();

    if (year < 1980) {
      year = 1980;
    }

    const dosTime =
      (date.getSeconds() >> 1) |
      (date.getMinutes() << 5) |
      (date.getHours() << 11);

    const dosDate =
      date.getDate() | ((date.getMonth() + 1) << 5) | ((year - 1980) << 9);

    return {
      dosTime,
      dosDate,
    };
  }

  class SimpleZip {
    constructor() {
      this.files = [];
      this.encoder = new TextEncoder();
      this.modifiedAt = new Date();
    }

    addStoredFile(path, textOrBytes) {
      this.files.push({
        path,
        bytes:
          typeof textOrBytes === "string"
            ? this.encoder.encode(textOrBytes)
            : toUint8Array(textOrBytes),
        compressionMethod: 0,
      });
    }

    addFile(path, textOrBytes) {
      this.addStoredFile(path, textOrBytes);
    }

    toBlob() {
      const fileRecords = [];
      const centralRecords = [];
      let offset = 0;
      const { dosTime, dosDate } = getDosDateTime(this.modifiedAt);

      for (const file of this.files) {
        const nameBytes = this.encoder.encode(file.path);
        const data = file.bytes;
        const crc = crc32(data);
        const utf8Flag = 0x0800;

        const localHeader = new Uint8Array(30 + nameBytes.length);
        const lh = new DataView(localHeader.buffer);

        lh.setUint32(0, 0x04034b50, true);
        lh.setUint16(4, 20, true);
        lh.setUint16(6, utf8Flag, true);
        lh.setUint16(8, file.compressionMethod, true);
        lh.setUint16(10, dosTime, true);
        lh.setUint16(12, dosDate, true);
        lh.setUint32(14, crc >>> 0, true);
        lh.setUint32(18, data.length, true);
        lh.setUint32(22, data.length, true);
        lh.setUint16(26, nameBytes.length, true);
        lh.setUint16(28, 0, true);
        localHeader.set(nameBytes, 30);

        fileRecords.push(localHeader, data);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const ch = new DataView(centralHeader.buffer);

        ch.setUint32(0, 0x02014b50, true);
        ch.setUint16(4, 20, true);
        ch.setUint16(6, 20, true);
        ch.setUint16(8, utf8Flag, true);
        ch.setUint16(10, file.compressionMethod, true);
        ch.setUint16(12, dosTime, true);
        ch.setUint16(14, dosDate, true);
        ch.setUint32(16, crc >>> 0, true);
        ch.setUint32(20, data.length, true);
        ch.setUint32(24, data.length, true);
        ch.setUint16(28, nameBytes.length, true);
        ch.setUint16(30, 0, true);
        ch.setUint16(32, 0, true);
        ch.setUint16(34, 0, true);
        ch.setUint16(36, 0, true);
        ch.setUint32(38, 0, true);
        ch.setUint32(42, offset, true);
        centralHeader.set(nameBytes, 46);

        centralRecords.push(centralHeader);
        offset += localHeader.length + data.length;
      }

      const centralSize = centralRecords.reduce((sum, x) => sum + x.length, 0);
      const end = new Uint8Array(22);
      const e = new DataView(end.buffer);

      e.setUint32(0, 0x06054b50, true);
      e.setUint16(4, 0, true);
      e.setUint16(6, 0, true);
      e.setUint16(8, this.files.length, true);
      e.setUint16(10, this.files.length, true);
      e.setUint32(12, centralSize, true);
      e.setUint32(16, offset, true);
      e.setUint16(20, 0, true);

      return new Blob([...fileRecords, ...centralRecords, end], {
        type: "application/epub+zip",
      });
    }
  }

  function getPostImageContext(state, post) {
    let context = IMAGE_CONTEXTS.get(post);

    if (!context) {
      context = buildImageRenderContext(state, post);
      IMAGE_CONTEXTS.set(post, context);
    }

    return context;
  }

  async function localizeImagesForPosts(state, posts, zip, onProgress) {
    const cache = new Map();

    for (let postIndex = 0; postIndex < posts.length; postIndex++) {
      const post = posts[postIndex];
      const attrs = post.attributes || {};
      const context = getPostImageContext(state, post);

      contentJsonStringToHtml(state, attrs.content_json_string || "", post, context);

      for (let imageIndex = 0; imageIndex < context.images.length; imageIndex++) {
        const image = context.images[imageIndex];
        const cached = cache.get(image.sourceUrl);

        if (cached) {
          image.localPath = cached.localPath;
          image.mediaType = cached.mediaType;
          continue;
        }

        if (typeof onProgress === "function") {
          onProgress(
            `Downloading images… ${postIndex + 1}/${posts.length} post${
              posts.length === 1 ? "" : "s"
            }`
          );
        }

        try {
          const resource = await fetchImageResource(image.sourceUrl);
          const mediaType = inferMediaType(image.sourceUrl, resource.contentType);
          const ext = extensionForMediaType(mediaType);
          const localPath = `images/p${post.id}-${imageIndex + 1}.${ext}`;

          zip.addFile(`OEBPS/${localPath}`, resource.bytes);

          image.localPath = localPath;
          image.mediaType = mediaType;

          cache.set(image.sourceUrl, {
            localPath,
            mediaType,
          });
        } catch (err) {
          console.warn("Image download failed, omitting image", image.sourceUrl, err);
          image.localPath = null;
          image.mediaType = null;
        }
      }
    }
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = filename;
    a.style.display = "none";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 30000);
  }

  function getExportDateUtc() {
    return new Date().toISOString().slice(0, 10);
  }

  async function exportSelectedPostsAsEpub(state, posts, onProgress) {
    if (!posts.length) {
      throw new Error("No posts selected.");
    }

    const zip = new SimpleZip();

    zip.addStoredFile("mimetype", "application/epub+zip");

    zip.addFile(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0"
  xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile
      full-path="OEBPS/content.opf"
      media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    const css = `
body {
  font-family: serif;
  line-height: 1.5;
}

h1, h2, h3, h4, h5, h6 {
  line-height: 1.2;
}

img {
  max-width: 100%;
  height: auto;
}

figure.patreon-image {
  margin: 1em 0;
  text-align: center;
}

figure.patreon-image figcaption {
  font-size: 0.9em;
  color: #555;
}

blockquote {
  margin: 1em 0;
  padding-left: 1em;
  border-left: 3px solid #ccc;
}

code {
  font-family: monospace;
}

.patreon-poll {
  margin-top: 1.5em;
  padding: 0.8em;
  border: 1px solid #ccc;
  border-radius: 6px;
}

.patreon-poll .poll-meta {
  color: #666;
  font-size: 0.95em;
}
`;

    zip.addFile("OEBPS/styles.css", css);

    const title = fileSafeName(state.creatorName || "Posts Export");
    const bookId = `urn:uuid:${crypto.randomUUID()}`;
    const exportDate = getExportDateUtc();
    const sorted = [...posts].reverse();

    if (typeof onProgress === "function") {
      onProgress("Preparing images…");
    }

    await localizeImagesForPosts(state, sorted, zip, onProgress);

    const manifestItems = [
      `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
      `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
      `<item id="css" href="styles.css" media-type="text/css"/>`,
    ];
    const spineItems = [];
    const navEntries = [];
    const usedNames = new Set();
    let assetCounter = 1;

    for (const post of sorted) {
      const context = getPostImageContext(state, post);

      for (const image of context.images) {
        if (
          image.localPath &&
          !manifestItems.some((item) => item.includes(`href="${image.localPath}"`))
        ) {
          manifestItems.push(
            `<item id="asset_${assetCounter++}" href="${escapeHtml(
              image.localPath
            )}" media-type="${escapeHtml(image.mediaType || "image/jpeg")}"/>`
          );
        }
      }
    }

    for (let i = 0; i < sorted.length; i++) {
      const post = sorted[i];
      const attrs = post.attributes || {};
      const postTitle = attrs.title || `Post ${i + 1}`;
      const fileName = makeUniqueChapterFileName(postTitle, usedNames);
      const context = getPostImageContext(state, post);
      const html = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <title>${escapeHtml(postTitle)}</title>
    <meta charset="utf-8"/>
    <link rel="stylesheet" type="text/css" href="styles.css"/>
  </head>
  <body>
    <h1>${escapeHtml(postTitle)}</h1>
    ${contentJsonStringToHtml(state, attrs.content_json_string || "", post, context)}
  </body>
</html>`;

      zip.addFile(`OEBPS/${fileName}`, html);

      manifestItems.push(
        `<item id="chap_${i + 1}" href="${escapeHtml(
          fileName
        )}" media-type="application/xhtml+xml"/>`
      );
      spineItems.push(`<itemref idref="chap_${i + 1}"/>`);
      navEntries.push({
        href: fileName,
        title: postTitle,
      });
    }

    const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      lang="en">
  <head>
    <title>Navigation</title>
    <meta charset="utf-8"/>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Contents</h1>
      <ol>
        ${navEntries
          .map(
            (entry) =>
              `<li><a href="${escapeHtml(entry.href)}">${escapeHtml(
                entry.title
              )}</a></li>`
          )
          .join("\n")}
      </ol>
    </nav>
  </body>
</html>`;

    const tocNcx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeHtml(bookId)}"/>
  </head>
  <docTitle>
    <text>${escapeHtml(title)}</text>
  </docTitle>
  <navMap>
    ${navEntries
      .map((entry, i) => {
        return `<navPoint id="navPoint-${i + 1}" playOrder="${
          i + 1
        }"><navLabel><text>${escapeHtml(
          entry.title
        )}</text></navLabel><content src="${escapeHtml(
          entry.href
        )}"/></navPoint>`;
      })
      .join("\n")}
  </navMap>
</ncx>`;

    const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
         unique-identifier="BookId"
         version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${escapeHtml(bookId)}</dc:identifier>
    <dc:title>${escapeHtml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>${escapeHtml(state.creatorName || "Unknown")}</dc:creator>
    <meta property="dcterms:modified">${escapeHtml(
      `${exportDate}T00:00:00Z`
    )}</meta>
    <dc:date>${escapeHtml(exportDate)}</dc:date>
  </metadata>
  <manifest>
    ${manifestItems.join("\n")}
  </manifest>
  <spine toc="ncx">
    <itemref idref="nav"/>
    ${spineItems.join("\n")}
  </spine>
</package>`;

    zip.addFile("OEBPS/nav.xhtml", navXhtml);
    zip.addFile("OEBPS/toc.ncx", tocNcx);
    zip.addFile("OEBPS/content.opf", contentOpf);

    const blob = zip.toBlob();
    triggerDownload(blob, `${title}.epub`);

    for (const post of sorted) {
      IMAGE_CONTEXTS.delete(post);
    }
  }

  root.epub = {
    exportSelectedPostsAsEpub,
  };
})();