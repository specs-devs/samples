/**
 * SPECS Inc. 2027
 * Surface generators: revolve (lathe), loft between two curves, swept surfaces and filled patches.
 */
import {resampleByCount} from "./Curve"
import {MeshData} from "./MeshData"
import {add, addScaled, cross, dot, length, normalize, P3, rotateAroundAxis, sub} from "./Vec"

/**
 * Revolves `profile` around the axis through `origin` along `axis` by `angle` radians in `segments` steps.
 * A full turn shares the seam vertices so normals are smooth across it.
 */
export function buildRevolve(
  profile: P3[],
  origin: P3,
  axis: P3,
  segments: number,
  angle: number = Math.PI * 2
): MeshData {
  const mesh = new MeshData()
  if (profile.length < 2) {
    return mesh
  }
  const a = normalize(axis)
  const full = Math.abs(angle - Math.PI * 2) < 1e-4
  const steps = Math.max(3, segments)
  const rings = full ? steps : steps + 1
  const m = profile.length
  for (let s = 0; s < rings; s++) {
    const theta = (angle * s) / steps
    for (const p of profile) {
      const local = sub(p, origin)
      mesh.addVertex(add(origin, rotateAroundAxis(local, a, theta)), {x: 0, y: 1, z: 0})
    }
  }
  for (let s = 0; s < steps; s++) {
    const r0 = s * m
    const r1 = ((s + 1) % rings) * m
    for (let i = 0; i < m - 1; i++) {
      mesh.addQuad(r0 + i, r1 + i, r1 + i + 1, r0 + i + 1)
    }
  }
  mesh.computeSmoothNormals()
  // Profiles can be drawn in either direction; revolved shells are viewed from both sides.
  mesh.addBackFaces()
  return mesh
}

/** Ruled surface between two curves, resampled to the same number of points. */
export function buildLoft(curveA: P3[], curveB: P3[], samples: number = 48, rows: number = 6): MeshData {
  const mesh = new MeshData()
  if (curveA.length < 2 || curveB.length < 2) {
    return mesh
  }
  const a = resampleByCount(curveA, samples).points
  let b = resampleByCount(curveB, samples).points
  // Match curve directions so the surface does not self-intersect into a bow tie.
  const straight = dist2(a[0], b[0]) + dist2(a[samples - 1], b[samples - 1])
  const flipped = dist2(a[0], b[samples - 1]) + dist2(a[samples - 1], b[0])
  if (flipped < straight) {
    b = b.slice().reverse()
  }
  const r = Math.max(1, rows)
  for (let j = 0; j <= r; j++) {
    const t = j / r
    for (let i = 0; i < samples; i++) {
      mesh.addVertex(addScaled(a[i], sub(b[i], a[i]), t), {x: 0, y: 1, z: 0})
    }
  }
  for (let j = 0; j < r; j++) {
    for (let i = 0; i < samples - 1; i++) {
      const p = j * samples + i
      const q = (j + 1) * samples + i
      mesh.addQuad(p, p + 1, q + 1, q)
    }
  }
  mesh.computeSmoothNormals()
  mesh.addBackFaces()
  return mesh
}

/**
 * Swept surface: a straight segment centered on each path point, oriented by `sides` (unit vectors along the
 * segment, typically the hand's sideways axis), with full width `widths[i]`.
 */
export function buildSweep(path: P3[], sides: P3[], widths: number[]): MeshData {
  const mesh = new MeshData()
  const n = path.length
  if (n < 2) {
    return mesh
  }
  let prevSide: P3 | null = null
  for (let i = 0; i < n; i++) {
    let side = normalize(sides[Math.min(i, sides.length - 1)], {x: 1, y: 0, z: 0})
    if (prevSide && dot(side, prevSide) < 0) {
      side = {x: -side.x, y: -side.y, z: -side.z}
    }
    prevSide = side
    const half = widths[Math.min(i, widths.length - 1)] / 2
    mesh.addVertex(addScaled(path[i], side, -half), {x: 0, y: 1, z: 0})
    mesh.addVertex(addScaled(path[i], side, half), {x: 0, y: 1, z: 0})
  }
  for (let i = 0; i < n - 1; i++) {
    const p = i * 2
    mesh.addQuad(p, p + 1, p + 3, p + 2)
  }
  mesh.computeSmoothNormals()
  mesh.addBackFaces()
  return mesh
}

/** Newell's method: robust normal of a (possibly non-planar) polygon. */
export function polygonNormal(loop: P3[]): P3 {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < loop.length; i++) {
    const c = loop[i]
    const d = loop[(i + 1) % loop.length]
    nx += (c.y - d.y) * (c.z + d.z)
    ny += (c.z - d.z) * (c.x + d.x)
    nz += (c.x - d.x) * (c.y + d.y)
  }
  return normalize({x: nx, y: ny, z: nz})
}

/**
 * Fills a closed loop with a triangulated patch (ear clipping on the best-fit plane).
 * The loop is resampled to at most `maxPoints` to keep triangulation cheap.
 */
export function buildFill(loopIn: P3[], maxPoints: number = 96): MeshData {
  const mesh = new MeshData()
  if (loopIn.length < 3) {
    return mesh
  }
  let loop = loopIn
  if (loop.length > maxPoints) {
    loop = resampleByCount(loopIn, maxPoints).points
  }
  // Drop a duplicated closing point.
  if (loop.length > 3 && dist2(loop[0], loop[loop.length - 1]) < 1e-6) {
    loop = loop.slice(0, loop.length - 1)
  }
  const normal = polygonNormal(loop)
  const u = normalize(sub(loop[1], loop[0]))
  const uAxis = normalize(
    sub(u, {x: normal.x * dot(u, normal), y: normal.y * dot(u, normal), z: normal.z * dot(u, normal)})
  )
  const vAxis = cross(normal, uAxis)
  const pts2 = loop.map((p) => ({x: dot(p, uAxis), y: dot(p, vAxis)}))

  for (const p of loop) {
    mesh.addVertex(p, normal)
  }
  const tris = earClip(pts2)
  for (const [a, b, c] of tris) {
    mesh.addTriangle(a, b, c)
  }
  if (mesh.indices.length > 0 && length(normal) > 0) {
    mesh.computeSmoothNormals()
  }
  mesh.addBackFaces()
  return mesh
}

interface P2 {
  x: number
  y: number
}

function cross2(o: P2, a: P2, b: P2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function pointInTriangle(p: P2, a: P2, b: P2, c: P2): boolean {
  const d1 = cross2(p, a, b)
  const d2 = cross2(p, b, c)
  const d3 = cross2(p, c, a)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/** Ear clipping for a simple polygon; returns CCW triangles relative to the polygon's own orientation. */
export function earClip(points: P2[]): [number, number, number][] {
  const n = points.length
  const out: [number, number, number][] = []
  if (n < 3) {
    return out
  }
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    area += a.x * b.y - b.x * a.y
  }
  const ccw = area > 0
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    idx.push(i)
  }
  let guard = 0
  while (idx.length > 3 && guard < n * n) {
    guard++
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k - 1 + idx.length) % idx.length]
      const i1 = idx[k]
      const i2 = idx[(k + 1) % idx.length]
      const a = points[i0]
      const b = points[i1]
      const c = points[i2]
      const turn = cross2(a, b, c)
      if (ccw ? turn <= 1e-12 : turn >= -1e-12) {
        continue
      }
      let inside = false
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) {
          continue
        }
        if (pointInTriangle(points[j], a, b, c)) {
          inside = true
          break
        }
      }
      if (inside) {
        continue
      }
      out.push(ccw ? [i0, i1, i2] : [i0, i2, i1])
      idx.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) {
      // Self-intersecting or degenerate loop: fall back to a fan over what is left.
      break
    }
  }
  if (idx.length >= 3) {
    for (let k = 1; k < idx.length - 1; k++) {
      out.push(ccw ? [idx[0], idx[k], idx[k + 1]] : [idx[0], idx[k + 1], idx[k]])
    }
  }
  return out
}

function dist2(a: P3, b: P3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}
