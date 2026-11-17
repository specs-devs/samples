/**
 * SPECS Inc. 2027
 * Builds the local-space mesh of a sketch item and answers proximity queries used for picking.
 */
import {MeshData} from "../Geometry/MeshData"
import {buildPrimitive, buildSphere, PrimitiveKind} from "../Geometry/Primitives"
import {buildSubDMesh, cageIsOpen} from "../Geometry/SubD"
import {buildFill, buildLoft, buildRevolve, buildSweep} from "../Geometry/SurfaceBuilder"
import {applySymmetry, symmetryCopies, symmetryPoint} from "../Geometry/Symmetry"
import {buildTube, CrossSection} from "../Geometry/TubeBuilder"
import {
  Bounds3,
  distanceToBounds,
  distanceToSegment,
  distanceToTriangle,
  emptyBounds,
  expandBounds,
  P3
} from "../Geometry/Vec"
import {ItemKind, SketchItem} from "./SketchTypes"

/** Width of the line used to draw measure annotations, in cm. */
export const MEASURE_LINE_WIDTH = 0.25

/** Height of a note pin (cm, item-local): its label floats just above. */
export const NOTE_PIN_HEIGHT = 3

let notePinMesh: MeshData | null = null

/** A map-pin marker: a small ball at the anchor, a stem, and a head the label sits on. */
function notePin(): MeshData {
  if (!notePinMesh) {
    const mesh = new MeshData()
    const ball = (radius: number, y: number) => {
      const s = buildSphere(12, 8)
      const part = new MeshData()
      for (let i = 0; i < s.vertexCount; i++) {
        const p = s.getPosition(i)
        part.addVertex(
          {x: p.x * radius * 2, y: y + p.y * radius * 2, z: p.z * radius * 2},
          {x: s.normals[i * 3], y: s.normals[i * 3 + 1], z: s.normals[i * 3 + 2]}
        )
      }
      part.indices = s.indices.slice()
      mesh.append(part)
    }
    ball(0.35, 0)
    mesh.append(
      buildTube(
        [
          {x: 0, y: 0, z: 0},
          {x: 0, y: NOTE_PIN_HEIGHT, z: 0}
        ],
        {section: CrossSection.Round, widths: [0.12]}
      )
    )
    ball(0.6, NOTE_PIN_HEIGHT)
    notePinMesh = mesh
  }
  return notePinMesh
}

const primitiveCache = new Map<PrimitiveKind, MeshData>()

function primitiveMesh(kind: PrimitiveKind): MeshData {
  let mesh = primitiveCache.get(kind)
  if (!mesh) {
    mesh = buildPrimitive(kind)
    primitiveCache.set(kind, mesh)
  }
  return mesh
}

/** Builds the item's mesh in item-local space, including baked symmetry copies. */
export function buildItemMesh(item: SketchItem, subdLevelOverride?: number): MeshData {
  let base: MeshData
  switch (item.kind) {
    case ItemKind.Stroke:
      base = buildTube(item.points ?? [], {
        section: item.section ?? CrossSection.Round,
        widths: item.widths ?? [1],
        ups: item.ups,
        taper: item.taper ?? 0
      })
      break
    case ItemKind.Sweep:
      base = buildSweep(item.points ?? [], item.ups ?? [], item.widths ?? [4])
      break
    case ItemKind.Revolve:
      base = buildRevolve(
        item.points ?? [],
        item.axisOrigin ?? {x: 0, y: 0, z: 0},
        item.axisDir ?? {x: 0, y: 1, z: 0},
        item.segments ?? 40
      )
      break
    case ItemKind.Loft:
      base = buildLoft(item.points ?? [], item.points2 ?? [])
      break
    case ItemKind.Fill:
      base = buildFill(item.points ?? [])
      break
    case ItemKind.Primitive:
      // Shared, immutable: callers must not modify primitive meshes.
      base = primitiveMesh(item.primitive ?? PrimitiveKind.Cube)
      break
    case ItemKind.SubD:
      base = item.cage
        ? buildSubDMesh(item.cage, subdLevelOverride ?? item.level ?? 2, cageIsOpen(item.cage))
        : new MeshData()
      break
    case ItemKind.Measure:
      base = buildTube(item.points ?? [], {section: CrossSection.Thin, widths: [MEASURE_LINE_WIDTH]})
      break
    case ItemKind.Note:
      // Shared, immutable like primitives. Notes ignore symmetry: a review comment is about one place.
      return notePin()
    default:
      base = new MeshData()
  }
  return item.symmetry ? applySymmetry(base, item.symmetry) : base
}

/** All curve points of the item (with symmetry copies), used for picking strokes. */
function curveCopies(item: SketchItem): P3[][] {
  const curves: P3[][] = []
  const sources = [item.points, item.points2].filter((c): c is P3[] => !!c && c.length > 0)
  const copies = item.symmetry ? symmetryCopies(item.symmetry) : 1
  for (const curve of sources) {
    for (let k = 0; k < copies; k++) {
      curves.push(k === 0 || !item.symmetry ? curve : curve.map((p) => symmetryPoint(item.symmetry!, p, k)))
    }
  }
  return curves
}

/**
 * Approximate distance from a local-space point to the item's surface. `mesh` is the item's built mesh
 * (pass it to avoid rebuilding). Returns Infinity when clearly far away.
 */
export function distanceToItem(
  item: SketchItem,
  local: P3,
  mesh: MeshData,
  bounds: Bounds3,
  maxDistance: number
): number {
  if (distanceToBounds(bounds, local) > maxDistance) {
    return Infinity
  }
  if (item.kind === ItemKind.Stroke || item.kind === ItemKind.Measure) {
    let best = Infinity
    const radius = item.kind === ItemKind.Measure ? MEASURE_LINE_WIDTH : maxWidth(item) / 2
    for (const curve of curveCopies(item)) {
      for (let i = 1; i < curve.length; i++) {
        best = Math.min(best, distanceToSegment(local, curve[i - 1], curve[i]).distance - radius)
      }
    }
    return Math.max(0, best)
  }
  // Meshes: exact triangle distance for modest meshes, vertex distance for heavy ones.
  const tris = mesh.triangleCount
  let best = Infinity
  if (tris <= 6000) {
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const d = distanceToTriangle(
        local,
        mesh.getPosition(mesh.indices[t]),
        mesh.getPosition(mesh.indices[t + 1]),
        mesh.getPosition(mesh.indices[t + 2])
      )
      if (d < best) {
        best = d
        if (best <= 0.01) {
          break
        }
      }
    }
  } else {
    for (let i = 0; i < mesh.vertexCount; i++) {
      const p = mesh.getPosition(i)
      const dx = p.x - local.x
      const dy = p.y - local.y
      const dz = p.z - local.z
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz))
    }
  }
  // Solid primitives / closed SubD: inside counts as touching.
  if ((item.kind === ItemKind.Primitive || item.kind === ItemKind.SubD) && distanceToBounds(bounds, local) === 0) {
    const shrunk = shrinkBounds(bounds, 0.15)
    if (distanceToBounds(shrunk, local) === 0) {
      return 0
    }
  }
  return best
}

function maxWidth(item: SketchItem): number {
  let w = 0
  for (const v of item.widths ?? [1]) {
    w = Math.max(w, v)
  }
  return w
}

function shrinkBounds(b: Bounds3, ratio: number): Bounds3 {
  const sx = (b.max.x - b.min.x) * ratio
  const sy = (b.max.y - b.min.y) * ratio
  const sz = (b.max.z - b.min.z) * ratio
  return {
    min: {x: b.min.x + sx, y: b.min.y + sy, z: b.min.z + sz},
    max: {x: b.max.x - sx, y: b.max.y - sy, z: b.max.z - sz}
  }
}

/** Bounds of a list of points. */
export function pointsBounds(points: P3[]): Bounds3 {
  const b = emptyBounds()
  for (const p of points) {
    expandBounds(b, p)
  }
  return b
}
