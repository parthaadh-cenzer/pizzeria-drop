import { Vector3 } from "three";
export function createHUD() {
  document
    .querySelector("main")
    .insertAdjacentHTML(
      "beforeend",
      `<div id="match-hud"><div id="match-banner"><b>LOCAL MATCH</b><span id="alive-count"></span><button id="controls-open" aria-label="Show controls">? Controls</button><button id="exit-match">Exit match</button><button id="fullscreen">⛶ Fullscreen</button></div><div id="floor-tracker" aria-label="Players per floor"></div><div id="nameplates"></div><div id="countdown" aria-live="polite"></div><div id="aim-reticle"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="progress" cx="60" cy="60" r="52"/></svg><i></i><span id="lock-text"></span></div><div id="weapon-status"></div><div id="match-help">WASD move · Drag mouse look · SPACE jump · E dive · Hold LMB aim/lock · Release fire · ? controls</div><div id="hud-flash" aria-live="polite"></div><div id="rocket-hint" hidden><b>ROCKET EQUIPPED</b><span>Hold <em class="k-fire"></em> to aim</span><span>Keep a target in the reticle for 2 seconds</span><span>Release to fire</span></div><div id="touch-controls"><div id="joystick" aria-label="Movement joystick"><i></i></div><div class="touch-actions"><button id="touch-dive">DIVE<small>E</small></button><button id="touch-jump">JUMP<small>SPACE</small></button><button id="touch-fire">FIRE<small>HOLD · AIM</small></button></div></div></div>`,
    );
  document.body.insertAdjacentHTML("beforeend", CONTROLS_PANEL);
  return new HUD();
}
const CONTROLS_PANEL = `<div id="controls-panel" hidden role="dialog" aria-modal="true" aria-labelledby="controls-title"><div class="cp-card"><h2 id="controls-title">How to drop</h2><p class="cp-sub">Tiles collapse 3 seconds after first touch. Fall into the lava and you're out.</p><div class="cp-cols"><section class="cp-desktop"><h3>Keyboard &amp; mouse</h3><dl><dt>W A S D</dt><dd>Move</dd><dt>Mouse drag</dt><dd>Camera / aim</dd><dt>SPACE</dt><dd>Jump</dd><dt>E</dt><dd>Dive</dd><dt>Hold LMB</dt><dd>Aim / lock rocket</dd><dt>Release LMB</dt><dd>Fire</dd></dl></section><section class="cp-touch"><h3>Touch</h3><dl><dt>Left stick</dt><dd>Move</dd><dt>Drag right side</dt><dd>Camera / aim</dd><dt>JUMP</dt><dd>Jump</dd><dt>DIVE</dt><dd>Dive</dd><dt>Hold FIRE</dt><dd>Aim / lock (drag to look)</dd><dt>Release FIRE</dt><dd>Fire</dd></dl></section></div><ul class="cp-rules"><li><b>Rocket launcher:</b> touch it to equip · 2 shots.</li><li>Keep a player in the reticle for <b>2 seconds</b> to lock, then release. Rockets break up to 4 tiles under the target — no damage.</li><li>Look up or down to hit other floors. Intact floors block rockets; gaps let them through.</li></ul><button id="controls-go">Got it — let's drop</button></div></div>`;
const coarse = () => matchMedia?.("(pointer: coarse)").matches;
class HUD {
  constructor() {
    this.names = new Map();
    this.eventTime = -1;
    this.audio = null;
    document.querySelector("#fullscreen").onclick = () => {
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    this.panel = document.querySelector("#controls-panel");
    this.onControlsClosed = null;
    this.hintShown = false;
    this.hintUntil = 0;
    this.flashUntil = 0;
    document.querySelector("#controls-go").onclick = () => this.hideControls();
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && !this.panel.hidden) this.hideControls();
    });
  }
  get controlsOpen() {
    return !this.panel.hidden;
  }
  showControls(onClosed = null) {
    this.panel.classList.toggle("touch-first", !!coarse());
    this.panel.hidden = false;
    this.onControlsClosed = onClosed;
    document.querySelector("#controls-go").focus({ preventScroll: true });
  }
  hideControls() {
    if (this.panel.hidden) return;
    this.panel.hidden = true;
    try {
      localStorage.setItem("pizzeria-drop-controls-seen", "1");
    } catch {}
    const done = this.onControlsClosed;
    this.onControlsClosed = null;
    done?.();
  }
  get controlsSeen() {
    try {
      return localStorage.getItem("pizzeria-drop-controls-seen") === "1";
    } catch {
      return false;
    }
  }
  flash(text, seconds = 1.6) {
    const el = document.querySelector("#hud-flash");
    el.textContent = text;
    el.classList.add("show");
    this.flashUntil = performance.now() + seconds * 1000;
  }
  showRocketHint() {
    const hint = document.querySelector("#rocket-hint");
    hint.querySelector(".k-fire").textContent = coarse() ? "FIRE" : "left mouse";
    hint.hidden = false;
    // Full instructions the first time, a brief reminder afterwards.
    this.hintUntil = performance.now() + (this.hintShown ? 2600 : 6000);
    this.hintShown = true;
  }
  unlockAudio() {
    try {
      this.audio ??= new (window.AudioContext || window.webkitAudioContext)();
      this.audio.resume();
    } catch {}
  }
  beep() {
    if (!this.audio) return;
    const o = this.audio.createOscillator(),
      g = this.audio.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(660, this.audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      1100,
      this.audio.currentTime + 0.14,
    );
    g.gain.setValueAtTime(0.035, this.audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.2);
    o.connect(g).connect(this.audio.destination);
    o.start();
    o.stop(this.audio.currentTime + 0.21);
  }
  reset() {
    document.querySelector("#nameplates").replaceChildren();
    this.names.clear();
    this.eventTime = -1;
  }
  update(match, camera, viewport, aim = {}) {
    const now = performance.now();
    if (now > this.hintUntil) document.querySelector("#rocket-hint").hidden = true;
    if (now > this.flashUntil)
      document.querySelector("#hud-flash").classList.remove("show");
    const p = match.players[0],
      width = viewport.clientWidth,
      height = viewport.clientHeight;
    document.querySelector("#alive-count").textContent =
      `${match.players.filter((p) => p.alive).length} / ${match.players.length} remaining`;
    document.querySelector("#countdown").textContent =
      match.phase === "countdown"
        ? Math.max(1, Math.ceil(match.countdown))
        : match.countdown > -0.5
          ? "DROP!"
          : "";
    document.querySelector("#floor-tracker").innerHTML = match.data.levels
      .map(
        (_, i) =>
          `<div class="${p.level === i ? "current" : ""}"><b>L${i + 1}</b><span>${
            match.players
              .filter((p) => p.alive && p.level === i)
              .map((a) => (a.id === 0 ? "◆" : "●"))
              .join(" ") || "—"
          }</span></div>`,
      )
      .join("");
    const lock = p.lock;
    document
      .querySelector("#aim-reticle")
      .classList.toggle("active", lock.holding);
    document
      .querySelector("#aim-reticle")
      .classList.toggle("locked", lock.locked);
    document.querySelector(".progress").style.strokeDashoffset =
      327 * (1 - lock.seconds / 2);
    document
      .querySelector("#aim-reticle")
      .classList.toggle("blocked", !!aim.blocked);
    document.querySelector("#lock-text").textContent = lock.locked
      ? aim.blocked
        ? "LOCKED · FLOOR IN THE WAY"
        : "LOCKED · RELEASE TO FIRE"
      : lock.target !== null
        ? `LOCKING ${((lock.seconds / 2) * 100).toFixed(0)}%${aim.blocked ? " · FLOOR IN THE WAY" : ""}`
        : "KEEP A PLAYER IN THE RING · LOOK UP / DOWN";
    document.querySelector("#weapon-status").innerHTML = !p.alive
      ? "ELIMINATED · <span>Reset to drop again</span>"
      : p.launcher !== null
        ? `ROCKETS: <b>${p.ammo}</b><span>${coarse() ? "Hold FIRE" : "Hold left mouse"} · lock 2s · release</span>`
        : "FIND A LAUNCHER <span>Touch to equip · two shots</span>";
    document.querySelector("#touch-fire").disabled =
      p.launcher === null || !p.alive;
    for (const a of match.players) {
      let label = this.names.get(a.id);
      if (!label) {
        label = document.createElement("div");
        label.className = "player-name";
        label.textContent = a.name;
        document.querySelector("#nameplates").appendChild(label);
        this.names.set(a.id, label);
      }
      const pt = a.position
        .clone()
        .add(new Vector3(0, 2.5, 0))
        .project(camera);
      const visible =
        a.alive &&
        a.id !== 0 &&
        pt.z < 1 &&
        pt.z > -1 &&
        Math.abs(pt.x) < 1 &&
        Math.abs(pt.y) < 1;
      label.hidden = !visible;
      label.classList.toggle("targeted", lock.target === a.id);
      label.classList.toggle("locked", lock.locked && lock.target === a.id);
      if (visible) {
        const delta = Math.abs(a.level - p.level),
          s = [1, 0.78, 0.57, 0.4][Math.min(delta, 3)];
        label.style.transform = `translate(${(pt.x * 0.5 + 0.5) * width}px,${(-pt.y * 0.5 + 0.5) * height}px) translate(-50%,-100%) scale(${s})`;
        label.style.opacity = 1 - delta * 0.19;
      }
    }
    for (const e of match.events) {
      if (e.time <= this.eventTime) continue;
      if (e.type === "locked" && e.player === 0) {
        this.beep();
        this.hintUntil = 0;
      }
      if (e.type === "equipped" && e.player === 0) this.showRocketHint();
      if (e.type === "fire-cancelled" && e.player === 0)
        this.flash("NOT LOCKED — HOLD 2s ON A TARGET");
      if (e.type === "rocket-impact" && e.owner === 0)
        this.flash(
          e.obstruction
            ? `FLOOR BLOCKED THE ROCKET · ${e.tiles.length} TILES`
            : `DIRECT HIT · ${e.tiles.length} TILES DOWN`,
        );
    }
    this.eventTime = match.time;
  }
}
