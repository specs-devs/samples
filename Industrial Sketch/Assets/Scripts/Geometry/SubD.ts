/**
 * SPECS Inc. 2027
 * Subdivision-surface modeling: an editable polygon cage smoothed with Catmull-Clark.
 */
import {MeshData} from "./MeshData"
import {add, addScaled, clone, cross, normalize, p3, P3, scale, sub} from "./Vec"

/** Polygon cage. Faces are vertex index loops in counter-clockwise order (seen from outside). */
export interface Cage {
  vertices: P3[]
  faces: number[][]
}

export enum CageKind {
  Box = "box",
  Cylinder = "cylinder",
  Sphere = "sphere",
  Plane = "plane"
}

export const CAGE_KINDS: CageKind[] = [CageKind.Box, CageKind.Cylinder, CageKind.Sphere, CageKind.Plane]

export function cageLabel(kind: CageKind): string {
  switch (kind) {
    case CageKind.Box:
      return "SubD Box"
    case CageKind.Cylinder:
      return "SubD Cylinder"
    case CageKind.Sphere:
      return "SubD Sphere"
    case CageKind.Plane:
      return "SubD Plane"
  }
}

export function cloneCage(cage: Cage): Cage {
  return {vertices: cage.vertices.map(clone), faces: cage.faces.map((f) => f.slice())}
}

/** Starter cages, sized to roughly a unit box centered on the origin. */
export function createCage(kind: CageKind): Cage {
  switch (kind) {
    case CageKind.Box:
      return boxCage(0.5)
    case CageKind.Sphere:
      return boxCage(0.62)
    case CageKind.Cylinder:
      return prismCage(8, 0.5, 0.5)
    case CageKind.Plane:
      return planeCage(3)
  }
}

function boxCage(h: number): Cage {
  const v = [
    p3(-h, -h, h),
    p3(h, -h, h),
    p3(h, h, h),
    p3(-h, h, h),
    p3(-h, -h, -h),
    p3(h, -h, -h),
    p3(h, h, -h),
    p3(-h, h, -h)
  ]
  const faces = [
    [0, 1, 2, 3], // +z
    [5, 4, 7, 6], // -z
    [1, 5, 6, 2], // +x
    [4, 0, 3, 7], // -x
    [3, 2, 6, 7], // +y
    [4, 5, 1, 0] // -y
  ]
  return {vertices: v, faces}
}

function prismCage(sides: number, radius: number, halfHeight: number): Cage {
  const vertices: P3[] = []
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    vertices.push(p3(Math.cos(a) * radius, -halfHeight, -Math.sin(a) * radius))
  }
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2
    vertices.push(p3(Math.cos(a) * radius, halfHeight, -Math.sin(a) * radius))
  }
  const faces: number[][] = []
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides
    faces.push([i, j, sides + j, sides + i])
  }
  const top: number[] = []
  const bottom: number[] = []
  for (let i = 0; i < sides; i++) {
    top.push(sides + i)
    bottom.push(sides - 1 - i)
  }
  faces.push(top, bottom)
  return {vertices, faces}
}

function planeCage(n: number): Cage {
  const vertices: P3[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      vertices.push(p3(i / n - 0.5, 0, 0.5 - j / n))
    }
  }
  const faces: number[][] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i
      faces.push([a, a + 1, a + n + 2, a + n + 1])
    }
  }
  return {vertices, faces}
}

function edgeKey(a: number, b: number): string {
  return a < b ? a + "_" + b : b + "_" + a
}

/** One Catmull-Clark step. Boundary edges and vertices use the standard crease rules. */
export function catmullClark(cage: Cage): Cage {
  const V = cage.vertices
  const F = cage.faces
  const facePoints: P3[] = F.map((f) => {
    let c = p3(0, 0, 0)
    for (const i of f) {
      c = add(c, V[i])
    }
    return scale(c, 1 / f.length)
  })

  // Edge adjacency.
  const edgeFaces = new Map<string, number[]>()
  const edgeVerts = new Map<string, [number, number]>()
  F.forEach((f, fi) => {
    for (let k = 0; k < f.length; k++) {
      const a = f[k]
      const b = f[(k + 1) % f.length]
      const key = edgeKey(a, b)
      if (!edgeFaces.has(key)) {
        edgeFaces.set(key, [])
        edgeVerts.set(key, [a, b])
      }
      edgeFaces.get(key)!.push(fi)
    }
  })

  const vertices: P3[] = []
  // Edge points.
  const edgeIndex = new Map<string, number>()
  const edgeMid = new Map<string, P3>()
  const edgePoint = new Map<string, P3>()
  const boundaryVert = new Array<boolean>(V.length).fill(false)
  edgeFaces.forEach((faces, key) => {
    const [a, b] = edgeVerts.get(key)!
    const mid = scale(add(V[a], V[b]), 0.5)
    edgeMid.set(key, mid)
    let point: P3
    if (faces.length === 2) {
      point = scale(add(add(V[a], V[b]), add(facePoints[faces[0]], facePoints[faces[1]])), 0.25)
    } else {
      point = mid
      boundaryVert[a] = true
      boundaryVert[b] = true
    }
    edgePoint.set(key, point)
  })

  // Vertex adjacency.
  const vertFaces: number[][] = V.map(() => [])
  F.forEach((f, fi) => f.forEach((i) => vertFaces[i].push(fi)))
  const vertEdges: string[][] = V.map(() => [])
  edgeVerts.forEach(([a, b], key) => {
    vertEdges[a].push(key)
    vertEdges[b].push(key)
  })

  // Updated original vertices.
  for (let i = 0; i < V.length; i++) {
    if (boundaryVert[i]) {
      const boundaryEdges = vertEdges[i].filter((k) => edgeFaces.get(k)!.length === 1)
      if (boundaryEdges.length === 2) {
        const m0 = edgeMid.get(boundaryEdges[0])!
        const m1 = edgeMid.get(boundaryEdges[1])!
        vertices.push(add(scale(V[i], 0.5), scale(add(m0, m1), 0.25)))
      } else {
        vertices.push(clone(V[i]))
      }
      continue
    }
    const n = vertFaces[i].length
    if (n < 3) {
      vertices.push(clone(V[i]))
      continue
    }
    let fAvg = p3(0, 0, 0)
    for (const fi of vertFaces[i]) {
      fAvg = add(fAvg, facePoints[fi])
    }
    fAvg = scale(fAvg, 1 / n)
    let rAvg = p3(0, 0, 0)
    for (const k of vertEdges[i]) {
      rAvg = add(rAvg, edgeMid.get(k)!)
    }
    rAvg = scale(rAvg, 1 / vertEdges[i].length)
    // (F + 2R + (n - 3)P) / n
    vertices.push(scale(add(add(fAvg, scale(rAvg, 2)), scale(V[i], n - 3)), 1 / n))
  }

  const faceStart = vertices.length
  for (const fp of facePoints) {
    vertices.push(fp)
  }
  edgePoint.forEach((point, key) => {
    edgeIndex.set(key, vertices.length)
    vertices.push(point)
  })

  const faces: number[][] = []
  F.forEach((f, fi) => {
    for (let k = 0; k < f.length; k++) {
      const prev = f[(k - 1 + f.length) % f.length]
      const cur = f[k]
      const next = f[(k + 1) % f.length]
      faces.push([cur, edgeIndex.get(edgeKey(cur, next))!, faceStart + fi, edgeIndex.get(edgeKey(prev, cur))!])
    }
  })
  return {vertices, faces}
}

/** Smooth mesh of the cage at the given subdivision level (0 = the cage itself, faceted). */
export function buildSubDMesh(cage: Cage, level: number, doubleSided: boolean = false): MeshData {
  let c = cage
  for (let i = 0; i < level; i++) {
    c = catmullClark(c)
  }
  const mesh = new MeshData()
  if (level === 0) {
    // Faceted cage preview: flat normals per face.
    for (const f of c.faces) {
      const n = faceNormal(c, f)
      const base = mesh.vertexCount
      for (const i of f) {
        mesh.addVertex(c.vertices[i], n)
      }
      for (let k = 1; k < f.length - 1; k++) {
        mesh.addTriangle(base, base + k, base + k + 1)
      }
    }
  } else {
    for (const v of c.vertices) {
      mesh.addVertex(v, p3(0, 1, 0))
    }
    for (const f of c.faces) {
      for (let k = 1; k < f.length - 1; k++) {
        mesh.addTriangle(f[0], f[k], f[k + 1])
      }
    }
    mesh.computeSmoothNormals()
  }
  if (doubleSided) {
    mesh.addBackFaces()
  }
  return mesh
}

export function faceNormal(cage: Cage, face: number[]): P3 {
  let n = p3(0, 0, 0)
  const o = cage.vertices[face[0]]
  for (let k = 1; k < face.length - 1; k++) {
    n = add(n, cross(sub(cage.vertices[face[k]], o), sub(cage.vertices[face[k + 1]], o)))
  }
  return normalize(n)
}

export function faceCenter(cage: Cage, face: number[]): P3 {
  let c = p3(0, 0, 0)
  for (const i of face) {
    c = add(c, cage.vertices[i])
  }
  return scale(c, 1 / face.length)
}

/** True when the cage has edges used by only one face (an open sheet such as the plane cage). */
export function cageIsOpen(cage: Cage): boolean {
  const counts = new Map<string, number>()
  for (const f of cage.faces) {
    for (let k = 0; k < f.length; k++) {
      const key = edgeKey(f[k], f[(k + 1) % f.length])
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  let open = false
  counts.forEach((n) => {
    if (n < 2) {
      open = true
    }
  })
  return open
}

/**
 * Extrudes face `faceIndex` by `distance` along its normal. The face is replaced by a copy
 * moved outward and joined to the old border by side quads. Returns the new cage and new face index.
 */
export function extrudeFace(cage: Cage, faceIndex: number, distance: number): {cage: Cage; face: number} {
  const out = cloneCage(cage)
  const face = out.faces[faceIndex]
  const n = faceNormal(out, face)
  const newIdx: number[] = []
  for (const i of face) {
    newIdx.push(out.vertices.length)
    out.vertices.push(addScaled(out.vertices[i], n, distance))
  }
  for (let k = 0; k < face.length; k++) {
    const a = face[k]
    const b = face[(k + 1) % face.length]
    const na = newIdx[k]
    const nb = newIdx[(k + 1) % face.length]
    out.faces.push([a, b, nb, na])
  }
  out.faces[faceIndex] = newIdx
  return {cage: out, face: faceIndex}
}

/**
 * Pairs of cage vertices that mirror each other across the x = 0 plane (within `tolerance`),
 * used for symmetric cage editing. Vertices on the plane map to themselves.
 */
export function mirrorPairs(cage: Cage, tolerance: number = 1e-3): number[] {
  const out = new Array<number>(cage.vertices.length).fill(-1)
  for (let i = 0; i < cage.vertices.length; i++) {
    const v = cage.vertices[i]
    for (let j = 0; j < cage.vertices.length; j++) {
      const w = cage.vertices[j]
      if (Math.abs(v.x + w.x) < tolerance && Math.abs(v.y - w.y) < tolerance && Math.abs(v.z - w.z) < tolerance) {
        out[i] = j
        break
      }
    }
  }
  return out
}
