/**
 * SPECS Inc. 2027
 * Conversions between the engine-independent geometry types and Lens Studio math types.
 */
import {P3} from "../Geometry/Vec"
import {ItemTransform} from "./SketchTypes"

export function toVec3(p: P3): vec3 {
  return new vec3(p.x, p.y, p.z)
}

export function toP3(v: vec3): P3 {
  return {x: v.x, y: v.y, z: v.z}
}

export function quatToArray(q: quat): [number, number, number, number] {
  return [q.x, q.y, q.z, q.w]
}

export function arrayToQuat(a: [number, number, number, number]): quat {
  return new quat(a[3], a[0], a[1], a[2])
}

/** Applies an item transform to a scene Transform (local to the sketch root). */
export function applyItemTransform(t: Transform, it: ItemTransform): void {
  t.setLocalPosition(toVec3(it.position))
  t.setLocalRotation(arrayToQuat(it.rotation))
  t.setLocalScale(toVec3(it.scale))
}

/** Item-local point -> sketch-root point. */
export function itemToRoot(it: ItemTransform, p: P3): vec3 {
  const scaled = new vec3(p.x * it.scale.x, p.y * it.scale.y, p.z * it.scale.z)
  return arrayToQuat(it.rotation).multiplyVec3(scaled).add(toVec3(it.position))
}

/** Sketch-root point -> item-local point. */
export function rootToItem(it: ItemTransform, p: vec3): P3 {
  const local = arrayToQuat(it.rotation)
    .invert()
    .multiplyVec3(p.sub(toVec3(it.position)))
  return {
    x: local.x / (it.scale.x || 1),
    y: local.y / (it.scale.y || 1),
    z: local.z / (it.scale.z || 1)
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** Snaps an angle (radians) to multiples of `step` radians. */
export function snapAngle(angle: number, step: number): number {
  return step > 0 ? Math.round(angle / step) * step : angle
}

/** Snaps a rotation to the nearest rotation whose Euler angles are multiples of `stepDeg` degrees. */
export function snapRotation(q: quat, stepDeg: number): quat {
  if (stepDeg <= 0) {
    return q
  }
  const e = q.toEulerAngles()
  const step = (stepDeg * Math.PI) / 180
  return quat.fromEulerAngles(snapAngle(e.x, step), snapAngle(e.y, step), snapAngle(e.z, step))
}

/** Yaw-only rotation (around world up) between two horizontal directions. */
export function yawBetween(from: vec3, to: vec3): number {
  const a = Math.atan2(from.x, from.z)
  const b = Math.atan2(to.x, to.z)
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Color as a CSS-style hex string (for labels). */
export function colorHex(c: [number, number, number]): string {
  const h = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0")
  return "#" + h(c[0]) + h(c[1]) + h(c[2])
}

/** HSV (all in [0, 1]) to RGB. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, t, p]
    case 1:
      return [q, v, p]
    case 2:
      return [p, v, t]
    case 3:
      return [p, q, v]
    case 4:
      return [t, p, v]
    default:
      return [v, p, q]
  }
}

export function rgbToHsv(c: [number, number, number]): [number, number, number] {
  const [r, g, b] = c
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
    if (h < 0) h += 1
  }
  return [h, max > 0 ? d / max : 0, max]
}
