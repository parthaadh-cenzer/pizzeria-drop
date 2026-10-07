import { Vector3 } from "three";
export function createHUD() {
  document
    .querySelector("main")
    .insertAdjacentHTML(
      "beforeend",
      `<div id="match-hud"><div id="match-banner"><b>LOCAL MATCH</b><span id="alive-count"></span><button id="controls-open" aria-label="Show controls">? Controls</button><button id="exit-match">Exit match</button><button id="fullscreen">⛶ Fullscreen</button></div><div id="floor-tracker" aria-label="Players per floor"></div><div id="nameplates"></div><div id="countdown" aria-live="polite"></div><div id="aim-reticle"><svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="progress" cx="60" cy="60" r="52"/></svg><i></i><span id="lock-text"></span></div><div id="weapon-status"></div><div id="match-help">WASD move · Drag mouse look · SPACE jump · E dive · Hold LMB aim/lock · Release fire · ? controls</div><div id="hud-flash" aria-live="polite"></div><div id="rocket-hint" hidden><b>ROCKET EQUIPPED</b><span>Hold <em class="k-fire"></em> to aim</span><span>Aim at a player to lock</span><span>Release to fire</span></div><div id="victory-banner" hidden><small>WINNER</small><strong id="victory-name"></strong></div><div id="results" hidden role="dialog" aria-modal="true" aria-labelledby="results-name"><div class="results-card"><div class="results-trophy" aria-hidden="true">🏆</div><small id="results-title">WINNER</small><h2 id="results-name"></h2><p id="results-sub">LAST ONE STANDING</p><ol id="results-placements"></ol><div class="results-actions"><button id="results-play-again" class="results-primary">PLAY AGAIN</button><button id="results-lobby">RETURN TO LOBBY</button></div></div></div><div id="touch-controls"><div id="joystick" aria-label="Movement joystick"><i></i></div><div class="touch-actions"><button id="touch-dive">DIVE<small>E</small></button><button id="touch-jump">JUMP<small>SPACE</small></button><button id="touch-fire">FIRE<small>HOLD · AIM</small></button></div></div></div>`,
    );
  document.body.insertAdjacentHTML("beforeend", CONTROLS_PANEL);
  return new HUD();
}
const CONTROLS_PANEL = `<div id="controls-panel" hidden role="dialog" aria-modal="true" aria-labelledby="controls-title"><div class="cp-card"><h2 id="controls-title">How to drop</h2><p class="cp-sub">Tiles collapse 3 seconds after first touch. Fall into the lava and you're out.</p><div class="cp-cols"><section class="cp-desktop"><h3>Keyboard &amp; mouse</h3><dl><dt>W A S D</dt><dd>Move</dd><dt>Mouse drag</dt><dd>Camera / aim</dd><dt>SPACE</dt><dd>Jump</dd><dt>E</dt><dd>Dive</dd><dt>Hold LMB</dt><dd>Aim / lock rocket</dd><dt>Release LMB</dt><dd>Fire</dd></dl></section><section class="cp-touch"><h3>Touch</h3><dl><dt>Left stick</dt><dd>Move</dd><dt>Drag right side</dt><dd>Camera / aim</dd><dt>JUMP</dt><dd>Jump</dd><dt>DIVE</dt><dd>Dive</dd><dt>Hold FIRE</dt><dd>Aim / lock (drag to look)</dd><dt>Release FIRE</dt><dd>Fire</dd></dl></section></div><ul class="cp-rules"><li><b>Rocket launcher:</b> touch it to equip · 2 shots.</li><li>Hold fire and <b>aim at a player to lock</b> instantly, then release to fire. Rockets break up to 4 tiles under the target — no damage.</li><li>Last pizzaiolo standing wins the crown.</li><li>Look up or down to hit other floors. Intact floors block rockets; gaps let them through.</li></ul><button id="controls-go">Got it — let's drop</button></div></div>`;
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
  showVictory(result) {
    this.hintUntil = 0;
    document.querySelector("#rocket-hint").hidden = true;
    const banner = document.querySelector("#victory-banner");
    banner.querySelector("small").textContent = result.draw ? "DRAW" : "WINNER";
    document.querySelector("#victory-name").textContent = result.draw
      ? "NO ONE STANDING"
      : result.winnerName;
    banner.hidden = false;
    this.fanfare();
  }
  showResults(result) {
    document.querySelector("#victory-banner").hidden = true;
    document.querySelector("#results-title").textContent = result.draw
      ? "DRAW"
      : "WINNER";
    document.querySelector("#results-name").textContent = result.draw
      ? "NO ONE STANDING"
      : result.winnerName;
    document.querySelector("#results-sub").textContent = result.draw
      ? "THE FLOOR WON THIS ONE"
      : "LAST ONE STANDING";
    const list = document.querySelector("#results-placements");
    list.replaceChildren(
      ...result.names.slice(0, 5).map((name) => {
        const li = document.createElement("li");
        li.textContent = name;
        return li;
      }),
    );
    document.querySelector("#results").hidden = false;
    document.querySelector("#results-play-again").focus({ preventScroll: true });
  }
  hideVictory() {
    document.querySelector("#victory-banner").hidden = true;
    document.querySelector("#results").hidden = true;
  }
  fanfare() {
    if (!this.audio) return;
    const now = this.audio.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = this.audio.createOscillator(),
        g = this.audio.createGain(),
        t = now + i * 0.11;
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 3 ? 0.6 : 0.2));
      o.connect(g).connect(this.audio.destination);
      o.start(t);
      o.stop(t + 0.65);
    });
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
      match.phase === "won"
        ? ""
        : match.phase === "countdown"
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
    document.querySelector(".progress").style.strokeDashoffset = lock.locked
      ? 0
      : 327;
    document
      .querySelector("#aim-reticle")
      .classList.toggle("blocked", !!aim.blocked);
    const locked = match.players[lock.target];
    document.querySelector("#lock-text").textContent = lock.locked
      ? `LOCKED · ${locked?.name ?? ""} · ${aim.blocked ? "FLOOR IN THE WAY" : "RELEASE TO FIRE"}`
      : "AIM AT A PLAYER TO LOCK · LOOK UP / DOWN";
    document.querySelector("#weapon-status").innerHTML = !p.alive
      ? "ELIMINATED · <span>Reset to drop again</span>"
      : p.launcher !== null
        ? `ROCKETS: <b>${p.ammo}</b><span>${coarse() ? "Hold FIRE" : "Hold left mouse"} · aim at a player · release</span>`
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
        this.flash("NOT LOCKED — AIM AT A PLAYER, THEN RELEASE");
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
