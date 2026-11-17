/**
 * SPECS Inc. 2027
 * Plain-number 3D vector helpers used by the geometry kernel of the Industrial Sketch lens.
 *
 * The kernel works on plain `{x, y, z}` records instead of Lens Studio `vec3` so it allocates less in hot
 * loops (mesh generation runs every frame while a stroke is drawn) and stays independent of the engine.
 */

export interface P3 {
  x: number
  y: number
  z: number
}

export function p3(x: number, y: number, z: number): P3 {
  return {x, y, z}
}

export function clone(a: P3): P3 {
  return {x: a.x, y: a.y, z: a.z}
}

export function add(a: P3, b: P3): P3 {
  return {x: a.x + b.x, y: a.y + b.y, z: a.z + b.z}
}

export function sub(a: P3, b: P3): P3 {
  return {x: a.x - b.x, y: a.y - b.y, z: a.z - b.z}
}

export function scale(a: P3, s: number): P3 {
  return {x: a.x * s, y: a.y * s, z: a.z * s}
}

/** a + b * s */
export function addScaled(a: P3, b: P3, s: number): P3 {
  return {x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s}
}

export function dot(a: P3, b: P3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: P3, b: P3): P3 {
  return {x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x}
}

export function length(a: P3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
}

export function distance(a: P3, b: P3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function distanceSq(a: P3, b: P3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}

/** Unit vector, or `fallback` when `a` is (almost) zero. */
export function normalize(a: P3, fallback: P3 = {x: 0, y: 1, z: 0}): P3 {
  const len = length(a)
  if (len < 1e-9) {
    return clone(fallback)
  }
  return {x: a.x / len, y: a.y / len, z: a.z / len}
}

export function lerp(a: P3, b: P3, t: number): P3 {
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t}
}

export function negate(a: P3): P3 {
  return {x: -a.x, y: -a.y, z: -a.z}
}

/** Any unit vector perpendicular to `n` (n must be unit length). */
export function anyPerpendicular(n: P3): P3 {
  const ref = Math.abs(n.y) < 0.9 ? {x: 0, y: 1, z: 0} : {x: 1, y: 0, z: 0}
  return normalize(cross(cross(n, ref), n))
}

/** Component of `v` perpendicular to unit vector `n`. */
export function rejectFrom(v: P3, n: P3): P3 {
  return addScaled(v, n, -dot(v, n))
}

/** Rotates `v` around the unit `axis` by `angle` radians (Rodrigues). */
export function rotateAroundAxis(v: P3, axis: P3, angle: number): P3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = cross(axis, v)
  const d = dot(axis, v) * (1 - c)
  return {
    x: v.x * c + k.x * s + axis.x * d,
    y: v.y * c + k.y * s + axis.y * d,
    z: v.z * c + k.z * s + axis.z * d
  }
}

/** Reflects point `p` across the plane through `origin` with unit `normal`. */
export function reflectPoint(p: P3, origin: P3, normal: P3): P3 {
  const d = dot(sub(p, origin), normal)
  return addScaled(p, normal, -2 * d)
}

/** Reflects direction `v` across a plane with unit `normal`. */
export function reflectDirection(v: P3, normal: P3): P3 {
  return addScaled(v, normal, -2 * dot(v, normal))
}

/** Distance from `p` to the segment [a, b]. Also returns the segment parameter of the closest point. */
export function distanceToSegment(p: P3, a: P3, b: P3): {distance: number; t: number} {
  const ab = sub(b, a)
  const lenSq = dot(ab, ab)
  let t = lenSq > 1e-12 ? dot(sub(p, a), ab) / lenSq : 0
  t = Math.max(0, Math.min(1, t))
  return {distance: distance(p, addScaled(a, ab, t)), t}
}

/** Distance from `p` to triangle (a, b, c). */
export function distanceToTriangle(p: P3, a: P3, b: P3, c: P3): number {
  const ab = sub(b, a)
  const ac = sub(c, a)
  const n = cross(ab, ac)
  const nLenSq = dot(n, n)
  if (nLenSq < 1e-12) {
    return Math.min(distanceToSegment(p, a, b).distance, distanceToSegment(p, a, c).distance)
  }
  // Barycentric test of the projection.
  const ap = sub(p, a)
  const d = dot(ap, n) / nLenSq
  const proj = addScaled(p, n, -d)
  const v0 = ac
  const v1 = ab
  const v2 = sub(proj, a)
  const d00 = dot(v0, v0)
  const d01 = dot(v0, v1)
  const d11 = dot(v1, v1)
  const d20 = dot(v2, v0)
  const d21 = dot(v2, v1)
  const denom = d00 * d11 - d01 * d01
  if (Math.abs(denom) > 1e-12) {
    const u = (d11 * d20 - d01 * d21) / denom
    const v = (d00 * d21 - d01 * d20) / denom
    if (u >= 0 && v >= 0 && u + v <= 1) {
      return Math.abs(d) * Math.sqrt(nLenSq)
    }
  }
  return Math.min(
    distanceToSegment(p, a, b).distance,
    distanceToSegment(p, b, c).distance,
    distanceToSegment(p, c, a).distance
  )
}

/** Rounds to a grid of `step` (step <= 0 returns the input). */
export function snapToGrid(p: P3, step: number): P3 {
  if (!(step > 0)) {
    return clone(p)
  }
  return {
    x: Math.round(p.x / step) * step,
    y: Math.round(p.y / step) * step,
    z: Math.round(p.z / step) * step
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export interface Bounds3 {
  min: P3
  max: P3
}

export function emptyBounds(): Bounds3 {
  return {min: p3(Infinity, Infinity, Infinity), max: p3(-Infinity, -Infinity, -Infinity)}
}

export function expandBounds(b: Bounds3, p: P3): void {
  if (p.x < b.min.x) b.min.x = p.x
  if (p.y < b.min.y) b.min.y = p.y
  if (p.z < b.min.z) b.min.z = p.z
  if (p.x > b.max.x) b.max.x = p.x
  if (p.y > b.max.y) b.max.y = p.y
  if (p.z > b.max.z) b.max.z = p.z
}

export function boundsValid(b: Bounds3): boolean {
  return b.min.x <= b.max.x && b.min.y <= b.max.y && b.min.z <= b.max.z
}

export function boundsCenter(b: Bounds3): P3 {
  return lerp(b.min, b.max, 0.5)
}

/** Distance from `p` to the box (0 when inside). */
export function distanceToBounds(b: Bounds3, p: P3): number {
  const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x)
  const dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y)
  const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}
