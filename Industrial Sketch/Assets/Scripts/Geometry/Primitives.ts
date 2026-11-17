/**
 * SPECS Inc. 2027
 * Unit-size primitive meshes (each fits a 1 x 1 x 1 box centered on the origin).
 */
import {MeshData} from "./MeshData"
import {normalize, p3, P3} from "./Vec"

export enum PrimitiveKind {
  Cube = "cube",
  Sphere = "sphere",
  Cylinder = "cylinder",
  Cone = "cone",
  Torus = "torus",
  Plane = "plane",
  Capsule = "capsule",
  Pyramid = "pyramid"
}

export const PRIMITIVE_KINDS: PrimitiveKind[] = [
  PrimitiveKind.Cube,
  PrimitiveKind.Sphere,
  PrimitiveKind.Cylinder,
  PrimitiveKind.Cone,
  PrimitiveKind.Torus,
  PrimitiveKind.Plane,
  PrimitiveKind.Capsule,
  PrimitiveKind.Pyramid
]

export function primitiveLabel(kind: PrimitiveKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

export function buildPrimitive(kind: PrimitiveKind): MeshData {
  switch (kind) {
    case PrimitiveKind.Cube:
      return buildBox()
    case PrimitiveKind.Sphere:
      return buildSphere(24, 16)
    case PrimitiveKind.Cylinder:
      return buildCylinder(32, 0.5, 0.5)
    case PrimitiveKind.Cone:
      return buildCylinder(32, 0.5, 0)
    case PrimitiveKind.Torus:
      return buildTorus(32, 16, 0.35, 0.15)
    case PrimitiveKind.Plane:
      return buildPlane()
    case PrimitiveKind.Capsule:
      return buildCapsule(24, 8, 0.25)
    case PrimitiveKind.Pyramid:
      return buildCylinder(4, 0.5, 0, Math.PI / 4)
  }
}

export function buildBox(): MeshData {
  const mesh = new MeshData()
  const faces: {n: P3; u: P3; v: P3}[] = [
    {n: p3(1, 0, 0), u: p3(0, 0, -1), v: p3(0, 1, 0)},
    {n: p3(-1, 0, 0), u: p3(0, 0, 1), v: p3(0, 1, 0)},
    {n: p3(0, 1, 0), u: p3(1, 0, 0), v: p3(0, 0, -1)},
    {n: p3(0, -1, 0), u: p3(1, 0, 0), v: p3(0, 0, 1)},
    {n: p3(0, 0, 1), u: p3(1, 0, 0), v: p3(0, 1, 0)},
    {n: p3(0, 0, -1), u: p3(-1, 0, 0), v: p3(0, 1, 0)}
  ]
  for (const f of faces) {
    const base = mesh.vertexCount
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ]) {
      mesh.addVertex(
        p3(
          (f.n.x + f.u.x * su + f.v.x * sv) * 0.5,
          (f.n.y + f.u.y * su + f.v.y * sv) * 0.5,
          (f.n.z + f.u.z * su + f.v.z * sv) * 0.5
        ),
        f.n
      )
    }
    mesh.addQuad(base, base + 1, base + 2, base + 3)
  }
  return mesh
}

export function buildSphere(segments: number, rings: number): MeshData {
  const mesh = new MeshData()
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2
      const n = p3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), -Math.sin(phi) * Math.sin(theta))
      mesh.addVertex(p3(n.x * 0.5, n.y * 0.5, n.z * 0.5), n)
    }
  }
  const row = segments + 1
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * row + s
      const b = (r + 1) * row + s
      mesh.addQuad(a, b, b + 1, a + 1)
    }
  }
  return mesh
}

/** Cylinder / cone / pyramid along Y with flat caps. */
export function buildCylinder(
  segments: number,
  radiusBottom: number,
  radiusTop: number,
  rotation: number = 0
): MeshData {
  const mesh = new MeshData()
  const slope = radiusBottom - radiusTop
  const flat = segments <= 6
  for (let s = 0; s < segments; s++) {
    const a0 = rotation + (s / segments) * Math.PI * 2
    const a1 = rotation + ((s + 1) / segments) * Math.PI * 2
    const am = (a0 + a1) / 2
    const n0 = flat ? sideNormal(am, slope) : sideNormal(a0, slope)
    const n1 = flat ? sideNormal(am, slope) : sideNormal(a1, slope)
    const b = mesh.vertexCount
    mesh.addVertex(p3(Math.cos(a0) * radiusBottom, -0.5, -Math.sin(a0) * radiusBottom), n0)
    mesh.addVertex(p3(Math.cos(a1) * radiusBottom, -0.5, -Math.sin(a1) * radiusBottom), n1)
    mesh.addVertex(p3(Math.cos(a1) * radiusTop, 0.5, -Math.sin(a1) * radiusTop), n1)
    mesh.addVertex(p3(Math.cos(a0) * radiusTop, 0.5, -Math.sin(a0) * radiusTop), n0)
    if (radiusTop > 1e-6) {
      mesh.addQuad(b, b + 1, b + 2, b + 3)
    } else {
      mesh.addTriangle(b, b + 1, b + 2)
    }
  }
  addDisk(mesh, segments, radiusBottom, -0.5, false, rotation)
  if (radiusTop > 1e-6) {
    addDisk(mesh, segments, radiusTop, 0.5, true, rotation)
  }
  return mesh
}

function sideNormal(angle: number, slope: number): P3 {
  return normalize(p3(Math.cos(angle), slope, -Math.sin(angle)))
}

function addDisk(mesh: MeshData, segments: number, radius: number, y: number, up: boolean, rotation: number): void {
  const n = p3(0, up ? 1 : -1, 0)
  const c = mesh.addVertex(p3(0, y, 0), n)
  const first = mesh.vertexCount
  for (let s = 0; s < segments; s++) {
    const a = rotation + (s / segments) * Math.PI * 2
    mesh.addVertex(p3(Math.cos(a) * radius, y, -Math.sin(a) * radius), n)
  }
  for (let s = 0; s < segments; s++) {
    const a = first + s
    const b = first + ((s + 1) % segments)
    if (up) {
      mesh.addTriangle(c, a, b)
    } else {
      mesh.addTriangle(c, b, a)
    }
  }
}

export function buildTorus(segments: number, sides: number, major: number, minor: number): MeshData {
  const mesh = new MeshData()
  for (let s = 0; s <= segments; s++) {
    const u = (s / segments) * Math.PI * 2
    const cu = Math.cos(u)
    const su = -Math.sin(u)
    for (let t = 0; t <= sides; t++) {
      const v = (t / sides) * Math.PI * 2
      const cv = Math.cos(v)
      const sv = Math.sin(v)
      const n = p3(cu * cv, sv, su * cv)
      mesh.addVertex(p3(cu * (major + minor * cv), minor * sv, su * (major + minor * cv)), n)
    }
  }
  const row = sides + 1
  for (let s = 0; s < segments; s++) {
    for (let t = 0; t < sides; t++) {
      const a = s * row + t
      const b = (s + 1) * row + t
      mesh.addQuad(a, b, b + 1, a + 1)
    }
  }
  return mesh
}

export function buildPlane(): MeshData {
  const mesh = new MeshData()
  const n = p3(0, 1, 0)
  mesh.addVertex(p3(-0.5, 0, 0.5), n)
  mesh.addVertex(p3(0.5, 0, 0.5), n)
  mesh.addVertex(p3(0.5, 0, -0.5), n)
  mesh.addVertex(p3(-0.5, 0, -0.5), n)
  mesh.addQuad(0, 1, 2, 3)
  mesh.addBackFaces()
  return mesh
}

/** Capsule along Y: total height 1, radius `radius`. */
export function buildCapsule(segments: number, capRings: number, radius: number): MeshData {
  const mesh = new MeshData()
  const half = 0.5 - radius
  const rows: {y: number; r: number; ny: number; nr: number}[] = []
  for (let i = 0; i <= capRings; i++) {
    const phi = (i / capRings) * (Math.PI / 2)
    rows.push({y: half + Math.cos(phi) * radius, r: Math.sin(phi) * radius, ny: Math.cos(phi), nr: Math.sin(phi)})
  }
  for (let i = 0; i <= capRings; i++) {
    const phi = Math.PI / 2 + (i / capRings) * (Math.PI / 2)
    rows.push({y: -half + Math.cos(phi) * radius, r: Math.sin(phi) * radius, ny: Math.cos(phi), nr: Math.sin(phi)})
  }
  for (const row of rows) {
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = -Math.sin(a)
      mesh.addVertex(p3(ca * row.r, row.y, sa * row.r), normalize(p3(ca * row.nr, row.ny, sa * row.nr)))
    }
  }
  const stride = segments + 1
  for (let r = 0; r < rows.length - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s
      const b = (r + 1) * stride + s
      mesh.addQuad(a, b, b + 1, a + 1)
    }
  }
  return mesh
}
