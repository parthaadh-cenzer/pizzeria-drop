import "./menu.css";
import {
  DEFAULT_SETTINGS,
  FLOORS,
  MAX_PLAYERS,
  CHARACTERS,
  sanitizeSettings,
  sanitizeName,
  normalizeCode,
  activeBots,
  joinUrl,
  CODE_LENGTH,
} from "../net/protocol.js";
import { Connection, errorText, savedSession } from "../net/connection.js";
import { BOT_NAMES } from "../gameplay.js";
import { ICONS } from "./icons.js";

const store = {
  get(k, d) {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const QUICK_DEFAULTS = { ...DEFAULT_SETTINGS, difficulty: "easy", floors: 5, bots: true, botCount: 5, botDifficulty: "medium" };

// Main menu → host/join/quick play → lobby. Owns the realtime Connection; the game owns rendering.
export function createMenu(game) {
  const root = document.createElement("div");
  root.id = "menu";
  root.innerHTML = MARKUP;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const state = {
    screen: "home",
    name: store.get("pizzeria-drop-name", ""),
    character: store.get("pizzeria-drop-character", "girl"),
    connection: null,
    lobby: null,
    you: null,
    local: false,
    localSettings: { ...QUICK_DEFAULTS, ...JSON.parse(store.get("pizzeria-drop-local", "{}") || "{}") },
    tab: "match",
    inMatch: false,
    lastStart: null,
  };
  $("#menu-name").value = state.name;
  $("#join-name").value = state.name;
  // Name fields on Home and Join stay in sync.
  for (const [a, b] of [["#menu-name", "#join-name"], ["#join-name", "#menu-name"]])
    $(a).addEventListener("input", () => {
      $(b).value = $(a).value;
      $(a).classList.remove("invalid");
    });
  const params = new URLSearchParams(location.search);
  if (params.get("room")) $("#join-code").value = normalizeCode(params.get("room"));

  const show = (screen) => {
    state.screen = screen;
    root.dataset.screen = screen;
    root.hidden = false;
    $("#menu-error").textContent = "";
  };
  const error = (text) => {
    $("#menu-error").textContent = text;
  };
  const busy = (text) => {
    $("#busy-text").textContent = text;
    show("busy");
  };
  const requireName = () => {
    const field = state.screen === "join" ? $("#join-name") : $("#menu-name");
    const name = sanitizeName(field.value);
    if (!name) {
      field.classList.add("invalid");
      field.focus();
      error("Enter your name first.");
      return null;
    }
    state.name = name;
    store.set("pizzeria-drop-name", name);
    game.setPlayerName(name);
    return name;
  };
  $("#menu-name").addEventListener("input", () => $("#menu-name").classList.remove("invalid"));
  $("#join-code").addEventListener("input", (e) => (e.target.value = normalizeCode(e.target.value)));

  // ---------- connection ----------
  function connection() {
    if (state.connection) return state.connection;
    const c = new Connection();
    c.addEventListener("lobby", (e) => {
      state.lobby = e.detail.lobby;
      // Host edits are optimistic; ignore echoes older than our latest settings revision.
      if (state.rev && (state.lobby.settingsRev ?? 0) < state.rev && state.pending)
        state.lobby.settings = state.pending;
      state.you = e.detail.you;
      if (state.screen === "lobby" || state.screen === "busy") renderLobby();
      if (state.inMatch && state.lobby.state === "lobby" && game.showingResults()) {
        // Someone returned the room to the lobby; our results card stays until we choose.
      }
    });
    c.addEventListener("start", (e) => {
      state.lastStart = e.detail;
      state.inMatch = true;
      root.hidden = true;
      game.startNet(e.detail, c);
    });
    c.addEventListener("error", (e) => {
      if (state.screen === "lobby") error(errorText(e.detail.code));
    });
    c.addEventListener("status", (e) => {
      const s = e.detail;
      document.body.classList.toggle("net-reconnecting", s === "reconnecting");
      if (s === "lost") {
        state.inMatch = false;
        game.toMenu();
        show("home");
        error("Connection lost. The room may have closed.");
        state.connection = null;
      }
    });
    state.connection = c;
    return c;
  }
  async function host() {
    const name = requireName();
    if (!name) return;
    busy("Creating room…");
    try {
      await connection().create(name, state.character);
      state.local = false;
      show("lobby");
      renderLobby();
    } catch (e) {
      state.connection?.leave();
      state.connection = null;
      show("home");
      error(errorText(e.message));
    }
  }
  async function join() {
    const name = requireName();
    if (!name) return;
    const code = normalizeCode($("#join-code").value);
    if (code.length !== CODE_LENGTH) {
      error(`Room codes have ${CODE_LENGTH} characters.`);
      return;
    }
    busy(`Joining ${code}…`);
    try {
      await connection().join(code, name, state.character);
      state.local = false;
      show("lobby");
      renderLobby();
    } catch (e) {
      state.connection?.leave();
      state.connection = null;
      show("join");
      error(errorText(e.message));
    }
  }
  async function tryResume() {
    const s = savedSession();
    if (!s) return false;
    busy("Reconnecting…");
    try {
      const c = connection();
      await c.resume(s);
      state.local = false;
      if (!state.inMatch) {
        show("lobby");
        renderLobby();
      }
      return true;
    } catch {
      state.connection = null;
      show("home");
      return false;
    }
  }
  function leave() {
    state.connection?.leave();
    state.connection = null;
    state.lobby = null;
    state.inMatch = false;
    state.local = false;
    show("home");
    game.preview(state.localSettings);
  }

  // ---------- local quick play ----------
  function localLobby() {
    const s = state.localSettings;
    return {
      code: null,
      state: "lobby",
      hostId: "me",
      settings: s,
      capacity: MAX_PLAYERS,
      canStart: activeBots(s) > 0 ? { ok: true } : { ok: false, reason: "need_players" },
      members: [
        { id: "me", name: state.name || "You", character: state.character, host: true, ready: true, connected: true, bot: false },
        ...Array.from({ length: activeBots(s) }, (_, i) => ({ id: `bot${i}`, name: `Bot ${BOT_NAMES[i % BOT_NAMES.length]}`, bot: true, ready: true, character: i % 2 ? "boy" : "girl" })),
      ],
    };
  }
  function quickPlay() {
    const name = requireName();
    if (!name) return;
    state.local = true;
    state.inMatch = true;
    root.hidden = true;
    game.startLocal(localConfig());
  }
  function localConfig() {
    const s = sanitizeSettings(state.localSettings, 1, state.localSettings);
    if (!activeBots(s)) Object.assign(s, { bots: true, botCount: Math.max(1, s.botCount) });
    return { ...s, name: state.name, character: state.character };
  }

  // ---------- lobby rendering ----------
  function lobby() {
    return state.local ? localLobby() : state.lobby;
  }
  function isHost() {
    const l = lobby();
    return state.local || (l && l.hostId === state.you);
  }
  function renderLobby() {
    const l = lobby();
    if (!l) return;
    const host = isHost();
    root.classList.toggle("is-host", host);
    root.classList.toggle("is-local", state.local);
    $("#room-code").textContent = l.code ?? "SOLO";
    $("#room-label").textContent = l.code ? "ROOM CODE" : "QUICK PLAY";
    const s = l.settings;
    const humans = l.members.filter((m) => !m.bot).length;
    // Settings (host editable, read-only for others).
    root.querySelectorAll("[data-set]").forEach((el) => {
      const [key, value] = el.dataset.set.split(":");
      const on = String(s[key]) === value;
      el.classList.toggle("on", on);
      el.setAttribute("aria-pressed", on);
      el.disabled = !host;
    });
    $("#floors-value").textContent = s.floors;
    $("#bots-value").textContent = s.botCount;
    $("#floor-down").disabled = !host || s.floors <= FLOORS.min;
    $("#floor-up").disabled = !host || s.floors >= FLOORS.max;
    $("#bot-down").disabled = !host || !s.bots || s.botCount <= 0;
    $("#bot-up").disabled = !host || !s.bots || s.botCount >= MAX_PLAYERS - humans;
    root.querySelector(".bot-options").classList.toggle("off", !s.bots);
    $("#capacity").textContent = `${l.members.length} / ${l.capacity}`;
    $("#host-note").hidden = host;
    // Players.
    $("#player-list").innerHTML = l.members
      .map((m) => {
        const badges = [
          m.host ? `<b class="badge host">HOST</b>` : "",
          m.bot ? `<b class="badge bot">BOT</b>` : "",
          !m.bot && !m.host ? `<b class="badge ${m.ready ? "ready" : "wait"}">${m.ready ? "READY" : "NOT READY"}</b>` : "",
          m.connected === false ? `<b class="badge wait">RECONNECTING</b>` : "",
        ].join("");
        return `<li class="${m.id === state.you || m.id === "me" ? "me" : ""}"><i class="dot ${m.character === "boy" ? "blue" : "red"}"></i><span>${esc(m.name)}</span>${badges}</li>`;
      })
      .join("");
    // Character.
    root.querySelectorAll("[data-character-pick]").forEach((b) => b.classList.toggle("on", b.dataset.characterPick === state.character));
    // Primary action.
    const action = $("#lobby-action");
    const me = l.members.find((m) => m.id === state.you || m.id === "me");
    if (host) {
      action.textContent = state.local ? "START" : "START GAME";
      action.disabled = !l.canStart.ok;
      $("#action-note").textContent = l.canStart.ok ? "" : errorText(l.canStart.reason);
    } else {
      action.disabled = false;
      action.textContent = me?.ready ? "NOT READY" : "READY";
      action.classList.toggle("ready", !!me?.ready);
      $("#action-note").textContent = me?.ready ? "Waiting for the host to start…" : "Tap READY when you're set.";
    }
    root.dataset.tab = state.tab;
    game.preview(s);
  }
  function change(patch) {
    if (!isHost()) return;
    if (state.local) {
      state.localSettings = sanitizeSettings({ ...state.localSettings, ...patch }, 1, state.localSettings);
      store.set("pizzeria-drop-local", JSON.stringify(state.localSettings));
      renderLobby();
    } else {
      const next = sanitizeSettings({ ...state.lobby.settings, ...patch }, state.lobby.members.filter((m) => !m.bot).length, state.lobby.settings);
      state.lobby.settings = next; // optimistic; server echoes canonical lobby
      state.rev = (state.rev ?? 0) + 1;
      state.pending = next;
      renderLobby();
      state.connection.send({ t: "settings", settings: next, rev: state.rev });
    }
  }
  root.querySelectorAll("[data-set]").forEach((el) =>
    el.addEventListener("click", () => {
      const [key, value] = el.dataset.set.split(":");
      change({ [key]: value === "true" ? true : value === "false" ? false : value });
    }),
  );
  $("#floor-down").onclick = () => change({ floors: lobby().settings.floors - 1 });
  $("#floor-up").onclick = () => change({ floors: lobby().settings.floors + 1 });
  $("#bot-down").onclick = () => change({ botCount: lobby().settings.botCount - 1 });
  $("#bot-up").onclick = () => change({ botCount: lobby().settings.botCount + 1 });
  root.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      root.dataset.tab = state.tab;
    }),
  );
  root.querySelectorAll("[data-character-pick]").forEach((b) =>
    b.addEventListener("click", () => {
      state.character = b.dataset.characterPick;
      store.set("pizzeria-drop-character", state.character);
      game.setCharacter(state.character);
      if (!state.local) state.connection?.send({ t: "character", character: state.character });
      renderLobby();
    }),
  );
  $("#lobby-action").onclick = () => {
    if (state.local) {
      state.inMatch = true;
      root.hidden = true;
      game.startLocal(localConfig());
      return;
    }
    if (isHost()) state.connection.send({ t: "start" });
    else {
      const me = state.lobby.members.find((m) => m.id === state.you);
      state.connection.send({ t: "ready", ready: !me?.ready });
    }
  };
  $("#copy-code").onclick = () => copy(lobby()?.code, "#copy-code", "COPIED");
  $("#share-link").onclick = async () => {
    const code = lobby()?.code;
    if (!code) return;
    const url = joinUrl(code);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Pizzeria Drop", text: `Join my Pizzeria Drop room ${code}`, url });
        return;
      } catch {}
    }
    copy(url, "#share-link", "LINK COPIED");
  };
  async function copy(text, sel, label) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    const b = $(sel),
      old = b.dataset.label ?? b.textContent;
    b.dataset.label = old;
    b.textContent = label;
    setTimeout(() => (b.textContent = old), 1400);
  }
  $("#btn-host").onclick = host;
  $("#btn-join").onclick = () => {
    show("join");
    (sanitizeName($("#join-name").value) ? $("#join-code") : $("#join-name")).focus();
  };
  $("#btn-quick").onclick = quickPlay;
  $("#join-go").onclick = join;
  $("#join-code").addEventListener("keydown", (e) => e.key === "Enter" && join());
  $("#join-back").onclick = () => show("home");
  $("#busy-cancel").onclick = leave;
  $("#lobby-leave").onclick = leave;
  $("#menu-controls").onclick = () => game.openControls();
  $("#menu-fullscreen").onclick = () => game.toggleFullscreen();

  // ---------- results / match exits (called by the game) ----------
  const api = {
    get connection() {
      return state.connection;
    },
    get lobby() {
      return lobby();
    },
    get screen() {
      return state.screen;
    },
    get session() {
      return state.local ? "local" : state.connection ? "online" : null;
    },
    playAgain() {
      if (state.local) return game.startLocal(localConfig());
      // Online: everyone returns to the room lobby; Play Again also marks this player ready.
      state.inMatch = false;
      state.connection?.send({ t: "lobby" });
      game.toMenu();
      show("lobby");
      renderLobby();
      if (!isHost()) state.connection?.send({ t: "ready", ready: true });
    },
    returnToLobby() {
      state.inMatch = false;
      if (!state.local) state.connection?.send({ t: "lobby" });
      game.toMenu();
      show("lobby");
      renderLobby();
    },
    exitMatch() {
      if (state.local) return api.returnToLobby();
      state.inMatch = false;
      game.toMenu();
      leave();
    },
    home() {
      show("home");
    },
  };
  // Boot: auto-resume a recent session (refresh during a match), else home.
  tryResume().then((ok) => {
    if (!ok) show(params.get("room") ? "join" : "home");
  });
  return api;
}

const MARKUP = `
<div class="menu-backdrop"></div>
<p id="menu-error" class="menu-error" role="alert"></p>
<section class="menu-screen screen-home" aria-label="Main menu">
  <div class="menu-brand"><span class="brand-mark">${ICONS.logo}</span><h1>PIZZERIA<b>DROP<i>.</i></b></h1><p>A little chaos. A long way down.</p></div>
  <div class="menu-card">
    <label class="field"><span>PLAYER NAME</span><input id="menu-name" maxlength="14" autocomplete="nickname" spellcheck="false" placeholder="Your name" enterkeyhint="done" /></label>
    <button id="btn-host" class="btn primary">${ICONS.host}<span>HOST GAME</span></button>
    <button id="btn-join" class="btn">${ICONS.join}<span>JOIN GAME</span></button>
    <button id="btn-quick" class="btn ghost">${ICONS.bolt}<span>QUICK PLAY <small>with bots</small></span></button>
  </div>
  <div class="menu-foot"><button id="menu-controls" class="chip">${ICONS.help} Controls</button><button id="menu-fullscreen" class="chip">${ICONS.fullscreen} Full screen</button><span id="build-version" class="build-version" title="Build">v${__BUILD__.version} · ${__BUILD__.commit}</span></div>
</section>
<section class="menu-screen screen-join" aria-label="Join game">
  <div class="menu-card">
    <h2>JOIN GAME</h2>
    <label class="field"><span>PLAYER NAME</span><input id="join-name" maxlength="14" autocomplete="nickname" spellcheck="false" placeholder="Your name" enterkeyhint="next" /></label>
    <label class="field"><span>ROOM CODE</span><input id="join-code" class="code-input" maxlength="${CODE_LENGTH}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="P7K4Q" inputmode="text" enterkeyhint="go" /></label>
    <button id="join-go" class="btn primary"><span>JOIN</span></button>
    <button id="join-back" class="btn ghost"><span>BACK</span></button>
  </div>
</section>
<section class="menu-screen screen-busy" aria-live="polite">
  <div class="menu-card center"><div class="spinner"></div><p id="busy-text">Connecting…</p><button id="busy-cancel" class="btn ghost"><span>CANCEL</span></button></div>
</section>
<section class="menu-screen screen-lobby" aria-label="Lobby">
  <div class="lobby-head">
    <button id="lobby-leave" class="icon-btn" aria-label="Leave room">${ICONS.back}</button>
    <div class="room"><small id="room-label">ROOM CODE</small><strong id="room-code">-----</strong></div>
    <div class="room-actions online-only"><button id="copy-code" class="chip">COPY CODE</button><button id="share-link" class="chip">${ICONS.share} SHARE LINK</button></div>
    <span id="capacity" class="capacity"></span>
  </div>
  <nav class="lobby-tabs" role="tablist">
    <button data-tab="match" role="tab">MATCH</button><button data-tab="players" role="tab">PLAYERS</button><button data-tab="character" role="tab">CHARACTER</button>
  </nav>
  <div class="lobby-body">
    <section class="panel panel-match">
      <h3>MATCH <small id="host-note">Host controls the match</small></h3>
      <div class="row"><span class="label">MAP</span><div class="seg two"><button data-set="world:volcano"><i class="swatch lava"></i>Volcano</button><button data-set="world:cityscape"><i class="swatch city"></i>Cityscape</button></div></div>
      <div class="row"><span class="label">DIFFICULTY</span><div class="seg"><button data-set="difficulty:easy">Easy</button><button data-set="difficulty:medium">Medium</button><button data-set="difficulty:hard">Hard</button></div></div>
      <div class="row"><span class="label">FLOORS</span><div class="stepper"><button id="floor-down" aria-label="Fewer floors">−</button><output>FLOORS: <b id="floors-value">7</b></output><button id="floor-up" aria-label="More floors">+</button></div></div>
      <div class="row"><span class="label">LIVES</span><div class="seg two"><button data-set="lives:false">Off</button><button data-set="lives:true">On · 3</button></div></div>
      <div class="row"><span class="label">BOTS</span><div class="seg two"><button data-set="bots:false">Off</button><button data-set="bots:true">On</button></div></div>
      <div class="bot-options">
        <div class="row"><span class="label">BOT COUNT</span><div class="stepper"><button id="bot-down" aria-label="Fewer bots">−</button><output><b id="bots-value">3</b> bots</output><button id="bot-up" aria-label="More bots">+</button></div></div>
        <div class="row"><span class="label">BOT SKILL</span><div class="seg"><button data-set="botDifficulty:easy">Easy</button><button data-set="botDifficulty:medium">Medium</button><button data-set="botDifficulty:hard">Hard</button></div></div>
      </div>
    </section>
    <section class="panel panel-players"><h3>PLAYERS</h3><ul id="player-list" class="player-list"></ul></section>
    <section class="panel panel-character"><h3>CHARACTER</h3><div class="char-pick">
      <button data-character-pick="girl"><i class="dot red"></i><strong>Girl</strong><small>Red hoodie</small></button>
      <button data-character-pick="boy"><i class="dot blue"></i><strong>Boy</strong><small>Blue jacket</small></button>
    </div></section>
  </div>
  <div class="lobby-foot"><p id="action-note"></p><button id="lobby-action" class="btn primary big">READY</button></div>
</section>`;
