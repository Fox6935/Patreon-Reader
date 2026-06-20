(() => {
  const root = (window.PRH = window.PRH || {});

  function stripInvalidXmlChars(value) {
    const str = String(value ?? "");
    let out = "";

    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);

      if (code >= 0xd800 && code <= 0xdbff) {
        const next = str.charCodeAt(i + 1);

        if (next >= 0xdc00 && next <= 0xdfff) {
          const codePoint =
            ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;

          if (codePoint >= 0x10000 && codePoint <= 0x10ffff) {
            out += str[i] + str[i + 1];
          } else {
            out += "\uFFFD";
          }

          i += 1;
          continue;
        }

        out += "\uFFFD";
        continue;
      }

      if (code >= 0xdc00 && code <= 0xdfff) {
        out += "\uFFFD";
        continue;
      }

      const isValid =
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0d ||
        (code >= 0x20 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd);

      if (isValid) {
        out += str[i];
      }
    }

    return out;
  }

  function escapeHtml(str) {
    return stripInvalidXmlChars(str).replace(/[&<>"']/g, (ch) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };

      return map[ch] || ch;
    });
  }

  function formatDate(iso) {
    if (!iso) {
      return "";
    }

    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) {
        return String(iso);
      }

      return d.toISOString().slice(0, 10);
    } catch {
      return String(iso);
    }
  }

  function getMark(node, type) {
    return (node.marks || []).find((m) => m.type === type) || null;
  }

  function renderInlineText(node) {
    let text = escapeHtml(node.text || "");

    if (getMark(node, "code")) {
      text = `<code>${text}</code>`;
    }
    if (getMark(node, "bold")) {
      text = `<strong>${text}</strong>`;
    }
    if (getMark(node, "italic")) {
      text = `<em>${text}</em>`;
    }
    if (getMark(node, "strike")) {
      text = `<s>${text}</s>`;
    }
    if (getMark(node, "underline")) {
      text = `<u>${text}</u>`;
    }

    const link = getMark(node, "link");
    const href = link?.attrs?.href;
    if (href) {
      text = `<a href="${escapeHtml(href)}">${text}</a>`;
    }

    return text;
  }

  function mediaFromId(state, mediaId) {
    return state.includedByKey.get(`media:${String(mediaId)}`) || null;
  }

  function chooseImageUrl(state, node) {
    const attrs = node?.attrs || {};
    const mediaId = attrs.media_id ? String(attrs.media_id) : null;
    const media = mediaId ? mediaFromId(state, mediaId) : null;
    const imageUrls = media?.attributes?.image_urls || {};

    return (
      attrs.src ||
      media?.attributes?.download_url ||
      imageUrls.original ||
      imageUrls.default ||
      imageUrls.large ||
      imageUrls.thumbnail ||
      ""
    );
  }

  function buildImageRenderContext(state, post) {
    const images = [];
    const seen = new Map();

    function register(node) {
      const url = chooseImageUrl(state, node);
      if (!url) {
        return null;
      }

      if (seen.has(url)) {
        return seen.get(url);
      }

      const index = images.length + 1;
      const entry = {
        key: `img-${index}`,
        sourceUrl: url,
        alt: node?.attrs?.alt || "",
        caption: node?.attrs?.caption || "",
        localPath: null,
        mediaType: null,
      };

      images.push(entry);
      seen.set(url, entry);
      return entry;
    }

    return {
      post,
      images,
      registerImage: register,
    };
  }

  function renderChildren(state, node, context) {
    return (node.content || [])
      .map((child) => renderNode(state, child, context))
      .join("");
  }

  function renderImageNode(state, node, context) {
    const image = context?.registerImage?.(node);
    if (!image) {
      return "";
    }

    const src = image.localPath || image.sourceUrl;
    if (!src) {
      return "";
    }

    const alt = escapeHtml(image.alt || "");
    const caption = image.caption ? escapeHtml(image.caption) : "";
    const align = escapeHtml(node?.attrs?.alignment || "center");

    return `
      <figure class="patreon-image align-${align}">
        <img src="${escapeHtml(src)}" alt="${alt}" />
        ${caption ? `<figcaption>${caption}</figcaption>` : ""}
      </figure>
    `;
  }

  function renderPollForPost(state, post) {
    const pollRel = post?.relationships?.poll?.data;
    if (!pollRel) {
      return "";
    }

    const poll = state.includedByKey.get(`poll:${pollRel.id}`);
    if (!poll) {
      return `
        <section class="patreon-poll">
          <h2>Poll</h2>
          <p>Poll data not available.</p>
        </section>
      `;
    }

    let choices = [];

    const directChoiceRefs = poll.relationships?.choices?.data || [];
    if (directChoiceRefs.length) {
      choices = directChoiceRefs
        .map((ref) => {
          return (
            state.includedByKey.get(`${ref.type}:${ref.id}`) ||
            state.includedByKey.get(`poll_choice:${ref.id}`)
          );
        })
        .filter(Boolean);
    }

    if (!choices.length) {
      choices = [...state.includedByKey.values()].filter((item) => {
        if (item?.type !== "poll_choice") {
          return false;
        }

        const pollId =
          item?.relationships?.poll?.data?.id ||
          item?.attributes?.poll_id ||
          item?.attributes?.pollId;

        return pollId ? String(pollId) === String(poll.id) : true;
      });
    }

    choices.sort((a, b) => {
      const ap = Number(a?.attributes?.position || 0);
      const bp = Number(b?.attributes?.position || 0);
      return ap - bp;
    });

    const attrs = poll.attributes || {};
    const multiple = attrs.allows_multiple_answers
      ? "Multiple choice"
      : "Single choice";
    const totalVotes =
      attrs.total_vote_count != null
        ? `${escapeHtml(String(attrs.total_vote_count))} votes`
        : "";
    const closedAt = attrs.closed_at
      ? `Closed: ${escapeHtml(formatDate(attrs.closed_at))}`
      : "";

    const meta = [multiple, totalVotes, closedAt].filter(Boolean).join(" • ");

    return `
      <section class="patreon-poll">
        <h2>Poll</h2>
        ${
          attrs.question
            ? `<p class="poll-question">${escapeHtml(attrs.question)}</p>`
            : ""
        }
        ${meta ? `<p class="poll-meta">${meta}</p>` : ""}
        <ol>
          ${choices
            .map((choice) => {
              const c = choice.attributes || {};
              const text =
                c.text_content || c.text || c.label || "Untitled option";
              return `<li>${escapeHtml(text)}</li>`;
            })
            .join("")}
        </ol>
      </section>
    `;
  }

  function renderNode(state, node, context) {
    if (!node || typeof node !== "object") {
      return "";
    }

    switch (node.type) {
      case "doc":
        return renderChildren(state, node, context);

      case "paragraph": {
        const inner = renderChildren(state, node, context);
        return inner.trim() ? `<p>${inner}</p>` : "<p></p>";
      }

      case "text":
        return renderInlineText(node);

      case "hardBreak":
        return "<br/>";

      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level || 2), 1), 6);
        return `<h${level}>${renderChildren(state, node, context)}</h${level}>`;
      }

      case "blockquote":
        return `<blockquote>${renderChildren(
          state,
          node,
          context
        )}</blockquote>`;

      case "bullet_list":
        return `<ul>${renderChildren(state, node, context)}</ul>`;

      case "ordered_list":
        return `<ol>${renderChildren(state, node, context)}</ol>`;

      case "list_item":
        return `<li>${renderChildren(state, node, context)}</li>`;

      case "image":
        return renderImageNode(state, node, context);

      case "horizontal_rule":
        return "<hr/>";

      default:
        return renderChildren(state, node, context);
    }
  }

  function contentJsonStringToHtml(state, contentJsonString, post, context) {
    let body = "<p></p>";

    if (contentJsonString) {
      try {
        const doc = JSON.parse(contentJsonString);
        body = renderNode(state, doc, context);
      } catch {
        body = `<p>${escapeHtml(contentJsonString)}</p>`;
      }
    }

    return `${body}${renderPollForPost(state, post)}`;
  }

  root.renderer = {
    escapeHtml,
    formatDate,
    buildImageRenderContext,
    contentJsonStringToHtml,
  };
})();