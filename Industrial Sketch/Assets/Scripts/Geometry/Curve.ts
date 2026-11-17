/**
 * SPECS Inc. 2027
 * Polyline utilities for hand-drawn curves: filtering, resampling, smoothing and soft-falloff editing.
 */
import {add, addScaled, clone, distance, lerp, P3, scale, sub} from "./Vec"

/**
 * One Euro filter for 3D points: low jitter when the hand is slow, low lag when it is fast.
 * See Casiez et al., "1€ Filter" (CHI 2012).
 */
export class OneEuroFilter3 {
  private prev: P3 | null = null
  private prevDeriv: P3 = {x: 0, y: 0, z: 0}
  private prevTime = 0

  constructor(
    public minCutoff: number = 1.2,
    public beta: number = 0.02,
    public derivCutoff: number = 1.0
  ) {}

  reset(): void {
    this.prev = null
    this.prevDeriv = {x: 0, y: 0, z: 0}
  }

  filter(p: P3, time: number): P3 {
    if (this.prev === null) {
      this.prev = clone(p)
      this.prevTime = time
      return clone(p)
    }
    const dt = Math.max(time - this.prevTime, 1e-4)
    this.prevTime = time
    const deriv = scale(sub(p, this.prev), 1 / dt)
    const aD = OneEuroFilter3.alpha(this.derivCutoff, dt)
    const smoothedDeriv = lerp(this.prevDeriv, deriv, aD)
    this.prevDeriv = smoothedDeriv
    const speed = Math.sqrt(
      smoothedDeriv.x * smoothedDeriv.x + smoothedDeriv.y * smoothedDeriv.y + smoothedDeriv.z * smoothedDeriv.z
    )
    const cutoff = this.minCutoff + this.beta * speed
    const a = OneEuroFilter3.alpha(cutoff, dt)
    const out = lerp(this.prev, p, a)
    this.prev = out
    return clone(out)
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }
}

/** Total length of a polyline. */
export function polylineLength(points: P3[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += distance(points[i - 1], points[i])
  }
  return len
}

/** Cumulative arc length at each point (first entry is 0). */
export function arcLengths(points: P3[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + distance(points[i - 1], points[i]))
  }
  return out
}

/**
 * Resamples a polyline to `count` points evenly spaced by arc length.
 * Optional per-point scalars (e.g. widths) are interpolated alongside.
 */
export function resampleByCount(points: P3[], count: number, values?: number[]): {points: P3[]; values: number[]} {
  if (points.length === 0) {
    return {points: [], values: []}
  }
  if (points.length === 1 || count < 2) {
    return {points: [clone(points[0])], values: values ? [values[0]] : []}
  }
  const lens = arcLengths(points)
  const total = lens[lens.length - 1]
  const outPoints: P3[] = []
  const outValues: number[] = []
  let seg = 1
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1)
    while (seg < points.length - 1 && lens[seg] < target) {
      seg++
    }
    const segLen = lens[seg] - lens[seg - 1]
    const t = segLen > 1e-9 ? (target - lens[seg - 1]) / segLen : 0
    outPoints.push(lerp(points[seg - 1], points[seg], Math.max(0, Math.min(1, t))))
    if (values) {
      outValues.push(values[seg - 1] + (values[seg] - values[seg - 1]) * Math.max(0, Math.min(1, t)))
    }
  }
  return {points: outPoints, values: outValues}
}

/** Resamples so consecutive points are about `spacing` apart (keeps both ends). */
export function resampleBySpacing(points: P3[], spacing: number, values?: number[]): {points: P3[]; values: number[]} {
  const total = polylineLength(points)
  const count = Math.max(2, Math.round(total / Math.max(spacing, 1e-4)) + 1)
  return resampleByCount(points, count, values)
}

/** Laplacian smoothing with fixed endpoints. `strength` in [0, 1], `iterations` passes. */
export function smoothPolyline(points: P3[], strength: number, iterations: number): P3[] {
  let current = points.map(clone)
  if (points.length < 3 || strength <= 0) {
    return current
  }
  for (let it = 0; it < iterations; it++) {
    const next = current.map(clone)
    for (let i = 1; i < current.length - 1; i++) {
      const mid = lerp(current[i - 1], current[i + 1], 0.5)
      next[i] = lerp(current[i], mid, strength)
    }
    current = next
  }
  return current
}

/** Smooths a closed loop (no fixed endpoints). */
export function smoothLoop(points: P3[], strength: number, iterations: number): P3[] {
  let current = points.map(clone)
  const n = points.length
  if (n < 4 || strength <= 0) {
    return current
  }
  for (let it = 0; it < iterations; it++) {
    const next = current.map(clone)
    for (let i = 0; i < n; i++) {
      const mid = lerp(current[(i - 1 + n) % n], current[(i + 1) % n], 0.5)
      next[i] = lerp(current[i], mid, strength)
    }
    current = next
  }
  return current
}

/** Catmull-Rom interpolation through control points, `subdivisions` samples per span. */
export function catmullRom(points: P3[], subdivisions: number): P3[] {
  if (points.length < 3 || subdivisions < 2) {
    return points.map(clone)
  }
  const out: P3[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        z:
          0.5 *
          (2 * p1.z +
            (-p0.z + p2.z) * t +
            (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
            (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      })
    }
  }
  out.push(clone(points[points.length - 1]))
  return out
}

/**
 * Moves the polyline around `index` by `delta` with a Gaussian falloff along the curve
 * (`radius` is measured in arc length). Returns a new array.
 */
export function softDeform(points: P3[], index: number, delta: P3, radius: number): P3[] {
  const lens = arcLengths(points)
  const center = lens[index]
  const r = Math.max(radius, 1e-4)
  return points.map((p, i) => {
    const d = (lens[i] - center) / r
    const w = Math.exp(-d * d * 2)
    return w < 1e-3 ? clone(p) : addScaled(p, delta, w)
  })
}

/** Centroid of a point list. */
export function centroid(points: P3[]): P3 {
  let c: P3 = {x: 0, y: 0, z: 0}
  for (const p of points) {
    c = add(c, p)
  }
  return points.length > 0 ? scale(c, 1 / points.length) : c
}

/** True when the ends of the polyline are within `tolerance` (or `ratio` of its length) of each other. */
export function isClosedLoop(points: P3[], tolerance: number, ratio: number = 0.15): boolean {
  if (points.length < 6) {
    return false
  }
  const gap = distance(points[0], points[points.length - 1])
  return gap <= Math.max(tolerance, polylineLength(points) * ratio)
}

/** Indices of evenly spaced control points along the curve (always includes both ends). */
export function controlPointIndices(points: P3[], spacing: number, maxCount: number = 24): number[] {
  if (points.length === 0) {
    return []
  }
  const lens = arcLengths(points)
  const total = lens[lens.length - 1]
  const count = Math.max(2, Math.min(maxCount, Math.round(total / Math.max(spacing, 1e-3)) + 1))
  const out: number[] = []
  let j = 0
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1)
    while (j < lens.length - 1 && lens[j] < target) {
      j++
    }
    if (out.length === 0 || out[out.length - 1] !== j) {
      out.push(j)
    }
  }
  if (out[out.length - 1] !== points.length - 1) {
    out.push(points.length - 1)
  }
  return out
}
