// Pointer IDs remain independent: movement, look and fire can run simultaneously.
export class GameControls {
  constructor(
    canvas,
    { enabled, canAim, jump, dive, hold, release, cancel, look },
  ) {
    this.keys = new Set();
    this.stick = { x: 0, z: 0 };
    this.lookPointers = new Map();
    this.firing = new Set();
    this.lastPointerType = matchMedia?.("(pointer: coarse)").matches
      ? "touch"
      : "mouse";
    this.callbacks = {
      enabled,
      canAim,
      jump,
      dive,
      hold,
      release,
      cancel,
      look,
    };
    this.canvas = canvas;
    const down = (e) => {
      if (!enabled() || e.target.matches("input,select,textarea")) return;
      if (
        [
          "Space",
          "KeyE",
          "KeyF",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === "Space") jump();
      if (e.code === "KeyE") dive();
      if (e.code === "KeyF") this.startFire("keyboard");
    };
    addEventListener("keydown", down);
    addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyF") this.endFire("keyboard");
    });
    addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      if (!enabled()) return;
      this.lastPointerType = e.pointerType === "touch" ? "touch" : "mouse";
      canvas.setPointerCapture(e.pointerId);
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.pointerType === "mouse" && e.button === 0 && canAim())
        this.startFire(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = this.lookPointers.get(e.pointerId);
      if (!enabled() || !p) return;
      look(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
    });
    canvas.addEventListener("pointerup", (e) => {
      this.lookPointers.delete(e.pointerId);
      this.endFire(e.pointerId);
    });
    canvas.addEventListener("pointercancel", (e) => {
      this.lookPointers.delete(e.pointerId);
      this.firing.delete(e.pointerId);
      cancel();
    });
    const stick = document.querySelector("#joystick"),
      knob = stick.querySelector("i");
    let active = null,
      origin;
    const move = (e) => {
      if (e.pointerId !== active) return;
      const x = e.clientX - origin.x,
        y = e.clientY - origin.y,
        r = Math.max(44, Math.hypot(x, y));
      this.stick = { x: x / r, z: y / r };
      knob.style.transform = `translate(${this.stick.x * 32}px,${this.stick.z * 32}px)`;
    };
    stick.addEventListener("pointerdown", (e) => {
      if (!enabled() || active !== null) return;
      e.preventDefault();
      active = e.pointerId;
      stick.setPointerCapture(active);
      const rect = stick.getBoundingClientRect();
      origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      move(e);
    });
    stick.addEventListener("pointermove", move);
    const end = (e) => {
      if (e.pointerId === active) {
        active = null;
        this.stick = { x: 0, z: 0 };
        knob.style.transform = "";
      }
    };
    stick.addEventListener("pointerup", end);
    stick.addEventListener("pointercancel", end);
    for (const [id, fn] of [
      ["jump", jump],
      ["dive", dive],
    ]) {
      document
        .querySelector(`#touch-${id}`)
        .addEventListener("pointerdown", (e) => {
          e.preventDefault();
          if (enabled()) fn();
        });
    }
    const fire = document.querySelector("#touch-fire");
    // The thumb holding FIRE can also drag to look/aim.
    const fireDrag = new Map();
    fire.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.lastPointerType = "touch";
      fire.setPointerCapture(e.pointerId);
      fireDrag.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.startFire(e.pointerId);
    });
    fire.addEventListener("pointermove", (e) => {
      const p = fireDrag.get(e.pointerId);
      if (!p || !enabled()) return;
      look((e.clientX - p.x) * 1.15, (e.clientY - p.y) * 1.15);
      p.x = e.clientX;
      p.y = e.clientY;
    });
    fire.addEventListener("pointerup", (e) => {
      fireDrag.delete(e.pointerId);
      this.endFire(e.pointerId);
    });
    fire.addEventListener("pointercancel", (e) => {
      fireDrag.delete(e.pointerId);
      this.firing.delete(e.pointerId);
      cancel();
    });
  }
  startFire(id) {
    if (
      !this.callbacks.enabled() ||
      !this.callbacks.canAim() ||
      this.firing.has(id)
    )
      return;
    if (!this.firing.size) this.callbacks.hold();
    this.firing.add(id);
  }
  endFire(id) {
    if (!this.firing.has(id)) return;
    this.firing.delete(id);
    if (!this.firing.size) this.callbacks.release();
  }
  movement(yaw) {
    const x =
      this.stick.x +
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const z =
      this.stick.z +
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
    const len = Math.max(1, Math.hypot(x, z));
    return {
      x: (Math.cos(yaw) * x + Math.sin(yaw) * z) / len,
      z: (-Math.sin(yaw) * x + Math.cos(yaw) * z) / len,
    };
  }
  reset() {
    this.keys.clear();
    this.stick = { x: 0, z: 0 };
    this.lookPointers.clear();
    this.firing.clear();
    this.callbacks.cancel();
    const knob = document.querySelector("#joystick i");
    if (knob) knob.style.transform = "";
  }
}
