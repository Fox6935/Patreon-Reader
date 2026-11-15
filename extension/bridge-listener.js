(() => {
  const root = (window.PRH = window.PRH || {});
  const pending = [];
  let consumer = null;

  function isPostsPayload(payload) {
    return (
      payload?.source === "PRH_PAGE_BRIDGE" &&
      payload?.type === "PRH_POSTS_RESPONSE"
    );
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !isPostsPayload(event.data)) {
      return;
    }

    if (consumer) {
      consumer(event.data);
      return;
    }

    pending.push(event.data);
  });

  root.bridgeListener = {
    attach(handler) {
      consumer = handler;

      for (const payload of pending.splice(0)) {
        consumer(payload);
      }
    },
  };
})();
