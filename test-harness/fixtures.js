"use strict";

function docJson(text) {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

function post(id, title, extra) {
  return {
    type: "post",
    id: String(id),
    attributes: {
      title,
      published_at: "2026-01-15T10:00:00.000+00:00",
      post_type: "text_only",
      url: `https://www.patreon.com/posts/${id}`,
      patreon_url: `/posts/${id}`,
      content_teaser_text: `${title} teaser`,
      content_json_string: docJson(`Body of ${title}.`),
      ...(extra || {}),
    },
    relationships: {
      campaign: { data: { type: "campaign", id: "camp-1" } },
    },
  };
}

const campaign = {
  type: "campaign",
  id: "camp-1",
  attributes: { name: "Test Creator" },
};

const page1 = {
  data: [
    post(101, "Alpha post"),
    post(102, "Beta post"),
    post(103, "Gamma update"),
  ],
  included: [campaign],
  links: { next: "https://www.patreon.com/api/posts?json-api-version=1.0&page=2" },
  meta: { pagination: { total: 5 } },
};

const page2 = {
  data: [post(104, "Delta post"), post(105, "Epsilon post")],
  included: [campaign],
  links: {},
  meta: { pagination: { total: 5 } },
};

const imagePost = post(201, "Picture post", {
  content_json_string: JSON.stringify({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "See image:" }] },
      {
        type: "image",
        attrs: {
          src: "https://c10.patreonusercontent.com/test-image.png",
          alt: "An image",
        },
      },
    ],
  }),
});
const imageResponse = {
  data: [imagePost],
  included: [campaign],
  links: {},
  meta: { pagination: { total: 1 } },
};

module.exports = { docJson, post, campaign, page1, page2, imagePost, imageResponse };
