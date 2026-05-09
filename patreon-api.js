(() => {
  const root = (window.PRH = window.PRH || {});

  root.api = {
    isPostsApiUrl(url) {
      if (typeof url !== "string") {
        return false;
      }

      try {
        const u = new URL(url, location.href);
        return (
          u.origin === "https://www.patreon.com" &&
          u.pathname === "/api/posts" &&
          u.searchParams.get("json-api-version") === "1.0"
        );
      } catch {
        return false;
      }
    },

    parsePostsResponseText(text) {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },

    isPostsIndexResponse(json) {
      if (!json || typeof json !== "object") {
        return false;
      }

      const data = json.data;
      if (!Array.isArray(data)) {
        return false;
      }

      if (data.length > 0) {
        const allPosts = data.every((item) => item?.type === "post");
        if (!allPosts) {
          return false;
        }
      }

      const hasPaginationSignals =
        typeof json?.meta?.pagination === "object" ||
        typeof json?.links?.next === "string" ||
        typeof json?.links?.prev === "string";

      return hasPaginationSignals;
    },

    getPostsFromIndexResponse(json) {
      if (!this.isPostsIndexResponse(json)) {
        return [];
      }

      return (json.data || []).filter((item) => item?.type === "post" && item.attributes);
    },

    findPostsInResponse(json) {
      const posts = [];

      function walk(node) {
        if (!node) {
          return;
        }

        if (Array.isArray(node)) {
          for (const item of node) {
            walk(item);
          }
          return;
        }

        if (typeof node !== "object") {
          return;
        }

        if (node.type === "post" && node.attributes) {
          posts.push(node);
        }

        for (const value of Object.values(node)) {
          walk(value);
        }
      }

      walk(json);

      const unique = [];
      const seen = new Set();

      for (const post of posts) {
        if (!seen.has(post.id)) {
          seen.add(post.id);
          unique.push(post);
        }
      }

      return unique;
    },

    mergeIncluded(state, json) {
      for (const item of json?.included || []) {
        state.includedByKey.set(`${item.type}:${item.id}`, item);
      }
    },

    getCampaignFromResponse(json) {
      return (json?.included || []).find((item) => item.type === "campaign");
    },

    extractCampaignIdFromResponse(json) {
      const campaign =
        this.getCampaignFromResponse(json) ||
        (json?.data || []).find((item) => item.type === "campaign");

      if (campaign?.id) {
        return String(campaign.id);
      }

      for (const post of this.findPostsInResponse(json)) {
        const id = post?.relationships?.campaign?.data?.id;
        if (id) {
          return String(id);
        }
      }

      return null;
    },

    extractCampaignNameFromResponse(json) {
      const campaign = this.getCampaignFromResponse(json);
      return campaign?.attributes?.name || null;
    },

    addPostsToState(state, posts) {
      let added = 0;

      for (const post of posts) {
        if (!state.postsById.has(post.id)) {
          state.postsById.set(post.id, post);
          state.loadedPosts.push(post);
          state.selectedPostIds.add(post.id);
          added += 1;
        } else {
          state.postsById.set(post.id, post);
        }
      }

      return added;
    },

    mergePostsResponseIntoState(state, json) {
      if (!this.isPostsIndexResponse(json)) {
        return {
          postsAdded: 0,
          campaignId: null,
          campaignName: null,
        };
      }

      this.mergeIncluded(state, json);

      const posts = this.getPostsFromIndexResponse(json);
      const postsAdded = this.addPostsToState(state, posts);

      state.nextUrl = typeof json?.links?.next === "string" ? json.links.next : null;
      state.totalPosts = Number(json?.meta?.pagination?.total || 0);

      const campaignId = this.extractCampaignIdFromResponse(json);
      const campaignName = this.extractCampaignNameFromResponse(json);

      if (campaignId) {
        state.campaignId = campaignId;
      }

      if (campaignName) {
        state.creatorName = campaignName;
      }

      return {
        postsAdded,
        campaignId,
        campaignName,
      };
    },
  };
})();
