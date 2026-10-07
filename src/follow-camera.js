import { Vector3, MathUtils } from "three";
import { LEVELS } from "../assets/runtime/layout.js";
// Aim pitch: positive looks down. Wide enough to target a floor above or below.
export const AIM_PITCH = { min: -1.15, max: 1.3 };
export class FollowCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.28;
    this.aimPitch = 0.05;
    this.aiming = false;
    this.focus = new Vector3();
    this.distance = 6.8;
  }
  reset(position) {
    this.focus.copy(position).add(new Vector3(0, 1.1, 0));
    this.yaw = 0;
    this.pitch = 0.28;
    this.aimPitch = 0.05;
    this.aiming = false;
    this.camera.position.copy(this.focus).add(new Vector3(0, 2, 6.8));
    this.camera.lookAt(this.focus);
  }
  look(dx, dy) {
    if (this.aiming) {
      // Finer sensitivity while scoped; full pitch range for vertical targeting.
      this.yaw -= dx * 0.0042;
      this.aimPitch = MathUtils.clamp(
        this.aimPitch + dy * 0.0036,
        AIM_PITCH.min,
        AIM_PITCH.max,
      );
      return;
    }
    this.yaw -= dx * 0.006;
    this.pitch = MathUtils.clamp(this.pitch + dy * 0.004, -0.15, 0.85);
  }
  // Unit view direction for the current yaw and aim pitch.
  forward(target = new Vector3()) {
    const c = Math.cos(this.aimPitch);
    return target.set(
      -Math.sin(this.yaw) * c,
      -Math.sin(this.aimPitch),
      -Math.cos(this.yaw) * c,
    );
  }
  update(p, dt, aiming) {
    if (aiming && !this.aiming) this.aimPitch = 0.05;
    this.aiming = aiming;
    const wanted = p.position.clone().add(new Vector3(0, 1.1, 0));
    this.focus.lerp(wanted, 1 - Math.exp(-dt * 12));
    let desired, viewTarget;
    if (aiming) {
      // Over-the-shoulder camera converging on a point along the aim ray.
      const f = this.forward(),
        right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)),
        steep = Math.abs(Math.sin(this.aimPitch));
      viewTarget = this.focus.clone().addScaledVector(f, 14);
      desired = this.focus
        .clone()
        .addScaledVector(f, -4.6)
        .addScaledVector(right, 1.25 + steep * 0.7)
        .add(new Vector3(0, 0.35, 0));
    } else {
      const cos = Math.cos(this.pitch);
      desired = this.focus
        .clone()
        .add(
          new Vector3(
            Math.sin(this.yaw) * cos,
            Math.sin(this.pitch),
            Math.cos(this.yaw) * cos,
          ).multiplyScalar(this.distance),
        );
      viewTarget = this.focus
        .clone()
        .add(
          new Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(
            1.6,
          ),
        );
    }
    this.constrain(desired, p);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 14));
    this.camera.lookAt(viewTarget);
    this.camera.fov = MathUtils.damp(this.camera.fov, aiming ? 43 : 55, 12, dt);
    this.camera.updateProjectionMatrix();
  }
  // Winner moment: ease toward a slow orbit in front of the winner, looking at the chest.
  celebrate(p, dt, t, facing) {
    // Frame the head and crown, slightly from above.
    const head = p.position.clone().add(new Vector3(0, 1.45, 0));
    this.focus.lerp(head, 1 - Math.exp(-dt * 6));
    const angle = facing + Math.sin(t * 0.45) * 0.45,
      distance = MathUtils.lerp(7.4, 6.2, Math.min(1, t / 2.5));
    const desired = this.focus
      .clone()
      .add(
        new Vector3(Math.sin(angle) * distance, 1.6, Math.cos(angle) * distance),
      );
    this.constrain(desired, p);
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3.2));
    this.camera.lookAt(this.focus);
    this.camera.fov = MathUtils.damp(this.camera.fov, 42, 4, dt);
    this.camera.updateProjectionMatrix();
  }
  constrain(desired, p) {
    // The player camera stays inside both environments' clear inner cavity.
    desired.x = MathUtils.clamp(desired.x, -17.1, 17.1);
    desired.z = MathUtils.clamp(desired.z, -17.1, 17.1);
    const r = Math.hypot(desired.x, desired.z);
    if (r > 18) {
      desired.x *= 18 / r;
      desired.z *= 18 / r;
    }
    // Never above the underside of the floor overhead nor below the player's own floor.
    const above = LEVELS.filter((y) => y > p.position.y + 2.6).at(-1);
    if (above !== undefined) desired.y = Math.min(desired.y, above - 0.7);
    desired.y = Math.max(desired.y, p.position.y + 0.4);
    return desired;
  }
}
