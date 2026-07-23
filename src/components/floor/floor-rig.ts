/**
 * Runtime retargeting for the trading floor robots.
 *
 * Forged rigs ship with anonymized bone names (`bone_12`) and zero animation
 * clips — the three.ws viewer animates them server-side, but on our own
 * canvas they'd be statues. The skeleton hierarchy is still the standard
 * Mixamo layout though, so we can rediscover which bone is which purely from
 * the tree shape, then rename the tracks of stock Mixamo-style clips
 * (Ready Player Me animation library, MIT) onto each robot.
 */

import type { AnimationClip, Object3D } from "three";

interface BoneLike extends Object3D {
  isBone?: boolean;
}

function isBone(o: Object3D | null | undefined): o is BoneLike {
  return Boolean(o && (o as BoneLike).isBone);
}

function boneChildren(o: Object3D): BoneLike[] {
  return o.children.filter((c): c is BoneLike => isBone(c));
}

function subtreeSize(o: Object3D): number {
  let n = 0;
  o.traverse(() => n++);
  return n;
}

function worldX(o: Object3D): number {
  return o.matrixWorld.elements[12];
}

/** Follow single-bone chains: UpLeg -> Leg -> Foot -> ToeBase. */
function chainFrom(start: BoneLike, names: string[], map: Map<string, string>) {
  let cursor: BoneLike | undefined = start;
  for (const name of names) {
    if (!cursor) return;
    map.set(name, cursor.name);
    cursor = boneChildren(cursor)[0];
  }
}

/**
 * Rebuild the standard Mixamo bone map from an anonymized skeleton.
 * Returns null when the hierarchy doesn't look humanoid enough to trust.
 */
export function resolveMixamoBones(root: Object3D): Map<string, string> | null {
  root.updateMatrixWorld(true);

  const bones: BoneLike[] = [];
  root.traverse((o) => {
    if (isBone(o)) bones.push(o);
  });
  if (bones.length < 20) return null;

  const hips = bones.find((b) => !isBone(b.parent));
  if (!hips) return null;

  const hipsKids = boneChildren(hips);
  if (hipsKids.length < 3) return null;

  // The spine subtree dwarfs each leg; legs sort left/right by bind-pose X.
  const sorted = [...hipsKids].sort((a, b) => subtreeSize(b) - subtreeSize(a));
  const spine = sorted[0];
  const legs = sorted.slice(1, 3).sort((a, b) => worldX(b) - worldX(a));
  const [leftUpLeg, rightUpLeg] = legs; // Mixamo faces +Z: left side = +X.

  const map = new Map<string, string>();
  map.set("Hips", hips.name);
  chainFrom(leftUpLeg, ["LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"], map);
  chainFrom(rightUpLeg, ["RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"], map);

  // Walk the spine until it branches into neck + shoulders.
  const spineNames = ["Spine", "Spine1", "Spine2"];
  let cursor: BoneLike | undefined = spine;
  let branch: BoneLike | null = null;
  for (const name of spineNames) {
    if (!cursor) break;
    map.set(name, cursor.name);
    const kids = boneChildren(cursor);
    if (kids.length > 1) {
      branch = cursor;
      break;
    }
    cursor = kids[0];
  }
  if (!branch) return map; // legs + spine still animate fine

  const branchKids = boneChildren(branch);
  const neck = [...branchKids].sort((a, b) => Math.abs(worldX(a)) - Math.abs(worldX(b)))[0];
  const shoulders = branchKids
    .filter((k) => k !== neck)
    .sort((a, b) => worldX(b) - worldX(a));
  if (neck) chainFrom(neck, ["Neck", "Head"], map);
  if (shoulders[0]) {
    chainFrom(shoulders[0], ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"], map);
  }
  if (shoulders[1]) {
    chainFrom(shoulders[1], ["RightShoulder", "RightArm", "RightForeArm", "RightHand"], map);
  }
  return map;
}

/** Hips height baked into a clip's first keyframe — the retarget reference. */
function clipHipsY(clip: AnimationClip): number {
  const track = clip.tracks.find((t) => /(^|[.:])Hips\.position$/.test(t.name));
  return track && track.values.length >= 2 ? Math.abs(track.values[1]) : 1;
}

/** q = a ⊗ b on flat [x,y,z,w] arrays (avoids importing three at runtime). */
function quatMul(a: number[], b: number[]): number[] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * Clone a Mixamo-style clip and rebase it onto an anonymized rig.
 *
 * Tracks are applied as DELTAS from the clip's first frame on top of each
 * bone's own bind pose: out(t) = bind ⊗ clip(0)⁻¹ ⊗ clip(t). Absolute
 * rotations doubled some rigs over (their bind orientation differs from the
 * clip's), and absolute hips positions slid the mesh away from the model's
 * logical position. Hips keep only their vertical bob — root motion on the
 * floor comes from moving the model, not the clip.
 *
 * Must be called while the skeleton is still in bind pose (before any
 * mixer update touches it).
 */
export function retargetMixamoClip(
  clip: AnimationClip,
  root: Object3D,
  boneMap: Map<string, string>
): AnimationClip {
  const bonesByName = new Map<string, BoneLike>();
  root.traverse((o) => {
    if (isBone(o)) bonesByName.set(o.name, o);
  });

  let hips: BoneLike | null = null;
  root.traverse((o) => {
    if (!hips && isBone(o) && !isBone(o.parent)) hips = o;
  });
  const hipsScale = hips
    ? Math.abs((hips as BoneLike).position.y) / (clipHipsY(clip) || 1)
    : 1;

  const cloned = clip.clone();
  cloned.tracks = cloned.tracks.filter((track) => {
    const dot = track.name.lastIndexOf(".");
    const boneName = track.name.slice(0, dot).replace(/^mixamorig:?/, "");
    const prop = track.name.slice(dot + 1);
    const mappedName = boneMap.get(boneName);
    const bone = mappedName ? bonesByName.get(mappedName) : undefined;
    if (!bone || prop === "scale") return false;

    if (prop === "quaternion") {
      // clone() can share the underlying arrays — copy before mutating.
      const values = track.values.slice();
      const q0inv = [-values[0], -values[1], -values[2], values[3]];
      const bind = [bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w];
      for (let i = 0; i < values.length; i += 4) {
        const q = quatMul(bind, quatMul(q0inv, [values[i], values[i + 1], values[i + 2], values[i + 3]]));
        const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        values[i] = q[0] / len;
        values[i + 1] = q[1] / len;
        values[i + 2] = q[2] / len;
        values[i + 3] = q[3] / len;
      }
      track.values = values;
    } else if (prop === "position") {
      if (boneName !== "Hips") return false;
      const values = track.values.slice();
      const y0 = values[1];
      for (let i = 0; i < values.length; i += 3) {
        values[i] = bone.position.x;
        values[i + 1] = bone.position.y + (values[i + 1] - y0) * hipsScale;
        values[i + 2] = bone.position.z;
      }
      track.values = values;
    }

    track.name = `${mappedName}.${prop}`;
    return true;
  });
  return cloned;
}
