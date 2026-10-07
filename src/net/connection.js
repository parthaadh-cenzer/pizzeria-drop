import { RECONNECT_GRACE_MS } from "./protocol.js";

// Resolve the realtime endpoint: explicit env (production/Staige) or same-origin /ws.
export function serverUrl() {
  const configured = import.meta.env?.VITE_GAME_SERVER_URL;
  if (configured) return configured;
  const url = new URL("ws", document.baseURI);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}
const SESSION_KEY = "pizzeria-drop-session";
export const savedSession = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return s && Date.now() - s.at < RECONNECT_GRACE_MS ? s : null;
  } catch {
    return null;
  }
};
const saveSession = (s) => {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, at: Date.now() }));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
};

const ERRORS = {
  not_found: "Room not found. Check the code.",
  started: "That match has already started.",
  full: "That room is full (15 players).",
  bad_name: "Enter a name first.",
  server_full: "The server is busy. Try again shortly.",
  timeout: "Couldn't reach the game server.",
  closed: "Connection closed.",
  not_ready: "Waiting for every player to be ready.",
  need_players: "Add a bot or wait for another player.",
  not_host: "Only the host can start.",
};
export const errorText = (code) => ERRORS[code] ?? "Something went wrong.";

// One realtime session: welcome/lobby/start/snap messages, ping, reconnect grace.
export class Connection extends EventTarget {
  constructor(url = serverUrl()) {
    super();
    this.url = url;
    this.ws = null;
    this.session = null; // { code, token, id }
    this.status = "idle";
    this.rtt = 0;
    this.lastMessage = 0;
    this.closedByUser = false;
  }
  emitEvent(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emitEvent("status", status);
  }
  open(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.close();
        reject(new Error("timeout"));
      }, timeoutMs);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.attach(ws);
        resolve();
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("timeout"));
      };
    });
  }
  attach(ws) {
    this.ws = ws;
    this.lastMessage = performance.now();
    ws.onmessage = (e) => {
      this.lastMessage = performance.now();
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === "pong") {
        this.rtt = Date.now() - m.c;
        return;
      }
      if (m.t === "welcome") {
        this.session = { code: m.code, token: m.token, id: m.id };
        saveSession(this.session);
      }
      this.emitEvent(m.t, m);
      this.emitEvent("message", m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearInterval(this.pinger);
      if (this.closedByUser) return this.setStatus("closed");
      this.reconnect();
    };
    clearInterval(this.pinger);
    this.pinger = setInterval(() => {
      if (!this.ws) return;
      this.send({ t: "ping", c: Date.now() });
      if (this.session) saveSession(this.session);
      // Silent socket (mobile network change): force the reconnect path.
      if (performance.now() - this.lastMessage > 6000) this.ws.close();
    }, 2000);
    this.setStatus("connected");
  }
  // Request/response helper: resolves on welcome, rejects with a readable error code.
  request(message, timeoutMs = 8000) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.ws) await this.open(timeoutMs);
      } catch {
        return reject(new Error("timeout"));
      }
      const done = (fn, v) => {
        clearTimeout(timer);
        this.removeEventListener("welcome", onWelcome);
        this.removeEventListener("error", onError);
        fn(v);
      };
      const onWelcome = (e) => done(resolve, e.detail);
      const onError = (e) => done(reject, new Error(e.detail.code));
      const timer = setTimeout(() => done(reject, new Error("timeout")), timeoutMs);
      this.addEventListener("welcome", onWelcome);
      this.addEventListener("error", onError);
      this.send(message);
    });
  }
  create(name, character) {
    this.closedByUser = false;
    return this.request({ t: "create", name, character });
  }
  join(code, name, character) {
    this.closedByUser = false;
    return this.request({ t: "join", code, name, character });
  }
  resume(session) {
    this.closedByUser = false;
    this.session = session;
    return this.request({ t: "resume", code: session.code, token: session.token });
  }
  async reconnect() {
    if (!this.session) return this.setStatus("lost");
    this.setStatus("reconnecting");
    const until = performance.now() + RECONNECT_GRACE_MS;
    while (performance.now() < until && !this.closedByUser) {
      try {
        await this.resume(this.session);
        this.emitEvent("resumed");
        return;
      } catch (e) {
        if (["not_found", "started"].includes(e.message)) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (!this.closedByUser) {
      saveSession(null);
      this.setStatus("lost");
    }
  }
  send(message) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(message));
  }
  leave() {
    this.closedByUser = true;
    this.send({ t: "leave" });
    saveSession(null);
    this.session = null;
    clearInterval(this.pinger);
    this.ws?.close();
    this.ws = null;
    this.setStatus("closed");
  }
}
