(() => {
  // Prevent double installation
  if (window.__PRH_BRIDGE_INSTALLED__) {
    return;
  }

  window.__PRH_BRIDGE_INSTALLED__ = true;
  window.__PRH_POSTS_QUEUE__ = window.__PRH_POSTS_QUEUE__ || [];

  if (!document.getElementById('prh-main-world-bridge')) {
    const script = document.createElement('script');
    script.id = 'prh-main-world-bridge';
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.onload = () => script.remove();

    (document.head || document.documentElement).prepend(script);
    
    return;
  }

  function isPostsApiUrl(url) {
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
  }

  function emit(url, text) {
    const payload = {
      source: "PRH_PAGE_BRIDGE",
      type: "PRH_POSTS_RESPONSE",
      url,
      text,
    };

    window.__PRH_POSTS_QUEUE__.push(payload);
    window.postMessage(payload, "*");
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);

      try {
        const url = String(args?.[0]?.url || args?.[0] || "");
        if (isPostsApiUrl(url)) {
          const clone = response.clone();
          clone
            .text()
            .then((text) => emit(url, text))
            .catch(() => {});
        }
      } catch (e) {}

      return response;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    const open = OriginalXHR.prototype.open;
    const send = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function (method, url, ...rest) {
      this.__prh_url = String(url || "");
      return open.call(this, method, url, ...rest);
    };

    OriginalXHR.prototype.send = function (...args) {
      this.addEventListener("load", function () {
        try {
          if (
            isPostsApiUrl(this.__prh_url) &&
            typeof this.responseText === "string"
          ) {
            emit(this.__prh_url, this.responseText);
          }
        } catch (e) {}
      });

      return send.apply(this, args);
    };
  }
})();