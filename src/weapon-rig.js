import { Vector3, Quaternion } from "three";
const axisY = new Vector3(0, 1, 0);
function pointBone(bone, direction, localAxis) {
  const parentQ = bone.parent.getWorldQuaternion(new Quaternion());
  bone.quaternion
    .copy(new Quaternion().setFromUnitVectors(localAxis, direction.normalize()))
    .premultiply(parentQ.invert());
  bone.updateWorldMatrix(false, true);
}
// Analytic two-bone IK keeps the mittens on actual weapon grip markers, after animation.
export function applyGrip(model, weapon) {
  if (!weapon.visible) return;
  model.updateMatrixWorld(true);
  for (const [side, x, grip] of [
    ["Right", -1, "RightGrip"],
    ["Left", 1, "LeftGrip"],
  ]) {
    const upper = model.getObjectByName(side + "Arm"),
      lower = model.getObjectByName(side + "ForeArm"),
      hand = model.getObjectByName(side + "Hand"),
      marker = weapon.getObjectByName(grip);
    if (!upper || !marker) return;
    const a = upper.getWorldPosition(new Vector3()),
      target = marker.getWorldPosition(new Vector3()),
      delta = target.clone().sub(a),
      distance = delta.length(),
      l1 = lower.position.length(),
      l2 = hand.position.length();
    const d = Math.min(
        l1 + l2 - 0.001,
        Math.max(Math.abs(l1 - l2) + 0.001, distance),
      ),
      dir = delta.normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
      height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const outward = new Vector3(x, -0.4, 0).applyQuaternion(
      model.getWorldQuaternion(new Quaternion()),
    );
    outward.addScaledVector(dir, -outward.dot(dir)).normalize();
    const elbow = a
      .clone()
      .addScaledVector(dir, along)
      .addScaledVector(outward, height);
    pointBone(upper, elbow.sub(a), new Vector3(x, 0, 0));
    const b = lower.getWorldPosition(new Vector3());
    pointBone(lower, target.clone().sub(b), new Vector3(x, 0, 0));
    hand.quaternion.identity();
  }
  model.updateMatrixWorld(true);
}
