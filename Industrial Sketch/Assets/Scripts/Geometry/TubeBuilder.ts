/**
 * SPECS Inc. 2027
 * Sweeps a 2D cross-section along a 3D polyline to build stroke meshes (tubes, square bars, ribbons).
 */
import {MeshData} from "./MeshData"
import {addScaled, anyPerpendicular, cross, dot, normalize, P3, rejectFrom, smoothstep, sub} from "./Vec"

/** Cross-section shapes available to stroke tools. */
export enum CrossSection {
  Round = "round",
  Square = "square",
  Triangle = "triangle",
  Ribbon = "ribbon",
  Thin = "thin"
}

export const CROSS_SECTIONS: CrossSection[] = [
  CrossSection.Round,
  CrossSection.Square,
  CrossSection.Triangle,
  CrossSection.Ribbon,
  CrossSection.Thin
]

export function crossSectionLabel(section: CrossSection): string {
  switch (section) {
    case CrossSection.Round:
      return "Round"
    case CrossSection.Square:
      return "Square"
    case CrossSection.Triangle:
      return "Triangle"
    case CrossSection.Ribbon:
      return "Ribbon"
    case CrossSection.Thin:
      return "Thin line"
  }
}

/** A profile vertex in the (normal, binormal) plane with its 2D normal. Coordinates are in [-1, 1]. */
interface ProfileVertex {
  u: number
  v: number
  nu: number
  nv: number
}

interface Profile {
  vertices: ProfileVertex[]
  /** Pairs of vertex indices that form the swept quads (CCW when seen from outside). */
  segments: [number, number][]
  closed: boolean
  /** Ribbons are open surfaces: render both sides. */
  doubleSided: boolean
}

const profileCache = new Map<string, Profile>()

function roundProfile(sides: number): Profile {
  const vertices: ProfileVertex[] = []
  const segments: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    vertices.push({u: Math.cos(a), v: Math.sin(a), nu: Math.cos(a), nv: Math.sin(a)})
    segments.push([i, (i + 1) % sides])
  }
  return {vertices, segments, closed: true, doubleSided: false}
}

/** Polygon with flat faces: corner vertices are duplicated so each face gets a hard normal. */
function flatPolygonProfile(corners: number, rotation: number): Profile {
  const vertices: ProfileVertex[] = []
  const segments: [number, number][] = []
  for (let i = 0; i < corners; i++) {
    const a0 = rotation + (i / corners) * Math.PI * 2
    const a1 = rotation + ((i + 1) / corners) * Math.PI * 2
    const mid = (a0 + a1) / 2
    const nu = Math.cos(mid)
    const nv = Math.sin(mid)
    vertices.push({u: Math.cos(a0), v: Math.sin(a0), nu, nv})
    vertices.push({u: Math.cos(a1), v: Math.sin(a1), nu, nv})
    segments.push([i * 2, i * 2 + 1])
  }
  return {vertices, segments, closed: true, doubleSided: false}
}

function ribbonProfile(): Profile {
  // A flat band along the frame normal; with this winding its front face points along -binormal.
  return {
    vertices: [
      {u: -1, v: 0, nu: 0, nv: -1},
      {u: 1, v: 0, nu: 0, nv: -1}
    ],
    segments: [[0, 1]],
    closed: false,
    doubleSided: true
  }
}

function getProfile(section: CrossSection): Profile {
  let profile = profileCache.get(section)
  if (!profile) {
    switch (section) {
      case CrossSection.Round:
        profile = roundProfile(12)
        break
      case CrossSection.Thin:
        profile = roundProfile(6)
        break
      case CrossSection.Square:
        profile = flatPolygonProfile(4, Math.PI / 4)
        break
      case CrossSection.Triangle:
        profile = flatPolygonProfile(3, Math.PI / 2)
        break
      case CrossSection.Ribbon:
        profile = ribbonProfile()
        break
    }
    profileCache.set(section, profile)
  }
  return profile
}

export interface TubeOptions {
  section: CrossSection
  /** Diameter (or ribbon width) per point, same length as the points. */
  widths: number[]
  /**
   * Optional per-point orientation hint (e.g. the hand's palm normal). When present the cross-section is
   * aligned to it, which is what makes ribbons twist with the hand. Otherwise parallel-transport frames are used.
   */
  ups?: P3[]
  /** Fade the width to zero over this fraction of the length at both ends (0 = no taper). */
  taper?: number
  /** Close the cross-section ends with flat caps (closed profiles only). */
  caps?: boolean
}

/** Per-point frames along a polyline. */
export interface Frames {
  tangents: P3[]
  normals: P3[]
  binormals: P3[]
}

/** Rotation-minimizing (parallel transport) frames, optionally steered by per-point up hints. */
export function computeFrames(points: P3[], ups?: P3[]): Frames {
  const n = points.length
  const tangents: P3[] = []
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(i - 1, 0)]
    const next = points[Math.min(i + 1, n - 1)]
    const fallback = i > 0 ? tangents[i - 1] : {x: 1, y: 0, z: 0}
    tangents.push(normalize(sub(next, prev), fallback))
  }
  const normals: P3[] = []
  const binormals: P3[] = []
  for (let i = 0; i < n; i++) {
    const t = tangents[i]
    let normal: P3
    if (ups && ups[i]) {
      normal = normalize(rejectFrom(ups[i], t), i > 0 ? normals[i - 1] : anyPerpendicular(t))
      // Avoid flips when the hint is almost parallel to the tangent.
      if (i > 0 && dot(normal, normals[i - 1]) < -0.2) {
        normal = {x: -normal.x, y: -normal.y, z: -normal.z}
      }
    } else if (i === 0) {
      // Prefer a frame whose normal points "up" for horizontal strokes, so square bars sit flat.
      const up = {x: 0, y: 1, z: 0}
      normal = Math.abs(dot(t, up)) < 0.95 ? normalize(rejectFrom(up, t)) : anyPerpendicular(t)
    } else {
      normal = normalize(rejectFrom(normals[i - 1], t), anyPerpendicular(t))
    }
    normals.push(normal)
    binormals.push(normalize(cross(t, normal)))
  }
  return {tangents, normals, binormals}
}

/** Width multiplier for tapered ends at normalized position `s` in [0, 1]. */
function taperFactor(s: number, taper: number): number {
  if (taper <= 0) {
    return 1
  }
  const a = smoothstep(0, taper, s)
  const b = smoothstep(0, taper, 1 - s)
  return Math.max(0.05, Math.min(a, b))
}

/** Builds a swept mesh along `points`. Returns an empty mesh for fewer than 2 points. */
export function buildTube(points: P3[], options: TubeOptions): MeshData {
  const mesh = new MeshData()
  const n = points.length
  if (n < 2) {
    return mesh
  }
  const profile = getProfile(options.section)
  const frames = computeFrames(points, options.ups)
  const taper = options.taper ?? 0

  // Arc length for taper.
  const lens = [0]
  for (let i = 1; i < n; i++) {
    const d = sub(points[i], points[i - 1])
    lens.push(lens[i - 1] + Math.sqrt(dot(d, d)))
  }
  const total = Math.max(lens[n - 1], 1e-6)

  const ringSize = profile.vertices.length
  for (let i = 0; i < n; i++) {
    const radius = (options.widths[Math.min(i, options.widths.length - 1)] / 2) * taperFactor(lens[i] / total, taper)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    for (const pv of profile.vertices) {
      const offset = addScaled(addScaled({x: 0, y: 0, z: 0}, N, pv.u * radius), B, pv.v * radius)
      const normal = normalize(addScaled(addScaled({x: 0, y: 0, z: 0}, N, pv.nu), B, pv.nv))
      mesh.addVertex(addScaled(points[i], offset, 1), normal)
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const r0 = i * ringSize
    const r1 = (i + 1) * ringSize
    for (const [a, b] of profile.segments) {
      // The profile runs counter-clockwise around the tangent (N x B = T), so this winding faces outward.
      mesh.addQuad(r0 + a, r0 + b, r1 + b, r1 + a)
    }
  }

  if (profile.closed && options.caps !== false && taper <= 0) {
    addCap(mesh, points[0], frames, 0, profile, options.widths[0] / 2, false)
    addCap(
      mesh,
      points[n - 1],
      frames,
      n - 1,
      profile,
      options.widths[Math.min(n - 1, options.widths.length - 1)] / 2,
      true
    )
  }

  if (profile.doubleSided) {
    mesh.addBackFaces()
  }
  return mesh
}

function addCap(
  mesh: MeshData,
  center: P3,
  frames: Frames,
  index: number,
  profile: Profile,
  radius: number,
  end: boolean
): void {
  const t = frames.tangents[index]
  const normal = end ? t : {x: -t.x, y: -t.y, z: -t.z}
  const N = frames.normals[index]
  const B = frames.binormals[index]
  const c = mesh.addVertex(center, normal)
  const first = mesh.vertexCount
  for (const pv of profile.vertices) {
    const offset = addScaled(addScaled({x: 0, y: 0, z: 0}, N, pv.u * radius), B, pv.v * radius)
    mesh.addVertex(addScaled(center, offset, 1), normal)
  }
  for (const [a, b] of profile.segments) {
    if (end) {
      mesh.addTriangle(c, first + a, first + b)
    } else {
      mesh.addTriangle(c, first + b, first + a)
    }
  }
}
