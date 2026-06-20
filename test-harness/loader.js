"use strict";

// Loads an extension source file (an IIFE that attaches to `window.PRH`) into a
// controlled sandbox. Each file references some browser globals as free
// identifiers; we inject those via `new Function(...names)` so we can stub them.
// Any global NOT listed in `env` (URL, Map, Set, TextEncoder, DataView, JSON,
// Date, crypto, Blob, ...) falls through to the real Node global.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "extension");

function loadModule(filename, env) {
  const src = fs.readFileSync(path.join(ROOT, filename), "utf8");
  const names = Object.keys(env);
  const values = names.map((n) => env[n]);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, `${src}\n//# sourceURL=${filename}`);
  fn(...values);
  return env.window.PRH;
}

function makeWindow() {
  const win = {};
  win.PRH = {};
  win.__PRH_POSTS_QUEUE__ = [];
  const listeners = {};
  win.addEventListener = (type, handler) => {
    (listeners[type] = listeners[type] || []).push(handler);
  };
  win.removeEventListener = (type, handler) => {
    listeners[type] = (listeners[type] || []).filter((h) => h !== handler);
  };
  win.postMessage = (data) => {
    win.__dispatch("message", { source: win, data });
  };
  win.__dispatch = (type, event) => {
    for (const h of listeners[type] || []) {
      h(event);
    }
  };
  win.__listeners = listeners;
  return win;
}

function makeChrome() {
  const state = { messageHandler: null, sent: [] };
  const chrome = {
    runtime: {
      lastError: null,
      getURL: (p) => `chrome-extension://test/${p}`,
      sendMessage: (msg, cb) => {
        state.sent.push(msg);
        if (typeof cb === "function") cb();
      },
      onMessage: {
        addListener: (handler) => {
          state.messageHandler = handler;
        },
      },
    },
    tabs: {
      query: (_q, cb) => cb([{ id: 1 }]),
      sendMessage: (_id, msg, cb) => {
        if (typeof cb === "function") cb(state.__contentReply?.(msg));
      },
    },
    __state: state,
  };
  return chrome;
}

// Chrome's onMessage convention: a handler returning true means it will call
// sendResponse asynchronously, so we must not resolve until it does.
function callMessageHandler(chrome, message) {
  return new Promise((resolve) => {
    const handler = chrome.__state.messageHandler;
    if (!handler) throw new Error("no message handler registered");
    let settled = false;
    const sendResponse = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const async = handler(message, { id: "test" }, sendResponse);
    if (!async && !settled) resolve(undefined);
  });
}

function makeDocument() {
  const documentElement = { appendChild() {}, removeChild() {} };
  return {
    documentElement,
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {} },
    getElementById: () => null,
    createElement: () => ({
      style: {},
      click() {},
      remove() {},
      appendChild() {},
      setAttribute() {},
    }),
  };
}

const noopMutationObserver = class {
  observe() {}
  disconnect() {}
};

module.exports = {
  ROOT,
  loadModule,
  makeWindow,
  makeChrome,
  callMessageHandler,
  makeDocument,
  noopMutationObserver,
};
