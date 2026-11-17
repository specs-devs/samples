/**
 * SPECS Inc. 2027
 * glTF 2.0 and STL export.
 *
 * glTF: a .gltf JSON file plus its binary buffer. The buffer is printed as base64 text (line breaks are fine);
 * decode it into the .bin file the JSON references, e.g. `base64 -D -i industrial_sketch.bin.b64 -o
 * industrial_sketch.bin` on macOS. Units are meters, +Y up, one node and PBR material per item / finish.
 *
 * STL: ASCII, millimeters, +Z up (slicer convention: sketch +Y becomes +Z), all items merged into one solid.
 */
import {SketchItem} from "../Core/SketchTypes"
import {BakedMesh, bakeItems, finishParameters, num} from "./ExportMeshes"

const CM_TO_M = 0.01
const CM_TO_MM = 10

export interface GltfExport {
  gltf: string
  /** Base64 of the .bin buffer, wrapped at 76 characters. */
  binBase64: string
  triangleCount: number
}

export function exportGltf(items: SketchItem[], name: string = "industrial_sketch"): GltfExport {
  const meshes = bakeItems(items)
  // Buffer layout per item: positions (float32 x3), normals (float32 x3), indices (uint32).
  let byteLength = 0
  for (const m of meshes) {
    byteLength += m.positions.length * 4 * 2 + m.indices.length * 4
  }
  const bytes = new Uint8Array(byteLength)
  const view = new DataView(bytes.buffer)
  let offset = 0
  const bufferViews: object[] = []
  const accessors: object[] = []
  const gltfMeshes: object[] = []
  const nodes: object[] = []
  const materials: object[] = []
  const materialIndex = new Map<string, number>()
  let triangleCount = 0

  const addView = (length: number, target: number) => {
    bufferViews.push({buffer: 0, byteOffset: offset, byteLength: length, target})
    return bufferViews.length - 1
  }

  for (const m of meshes) {
    const vertexCount = m.positions.length / 3
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    const posView = addView(vertexCount * 12, 34962)
    for (let i = 0; i < m.positions.length; i++) {
      const v = m.positions[i] * CM_TO_M
      view.setFloat32(offset, v, true)
      offset += 4
      const axis = i % 3
      min[axis] = Math.min(min[axis], v)
      max[axis] = Math.max(max[axis], v)
    }
    const nrmView = addView(vertexCount * 12, 34962)
    for (let i = 0; i < m.normals.length; i++) {
      view.setFloat32(offset, m.normals[i], true)
      offset += 4
    }
    const idxView = addView(m.indices.length * 4, 34963)
    for (const index of m.indices) {
      view.setUint32(offset, index, true)
      offset += 4
    }
    accessors.push(
      {
        bufferView: posView,
        componentType: 5126,
        count: vertexCount,
        type: "VEC3",
        min: fround3(min),
        max: fround3(max)
      },
      {bufferView: nrmView, componentType: 5126, count: vertexCount, type: "VEC3"},
      {bufferView: idxView, componentType: 5125, count: m.indices.length, type: "SCALAR"}
    )
    const a = accessors.length - 3
    gltfMeshes.push({
      name: m.name,
      primitives: [{attributes: {POSITION: a, NORMAL: a + 1}, indices: a + 2, material: materialFor(m)}]
    })
    nodes.push({name: m.name, mesh: gltfMeshes.length - 1})
    triangleCount += m.indices.length / 3
  }

  function materialFor(m: BakedMesh): number {
    const existing = materialIndex.get(m.materialName)
    if (existing !== undefined) {
      return existing
    }
    const finish = finishParameters(m.item.material)
    materials.push({
      name: m.materialName,
      pbrMetallicRoughness: {
        baseColorFactor: [m.item.color[0], m.item.color[1], m.item.color[2], 1],
        metallicFactor: finish.metallic,
        roughnessFactor: finish.roughness
      },
      // Strokes and sweeps are open surfaces seen from both sides.
      doubleSided: true
    })
    materialIndex.set(m.materialName, materials.length - 1)
    return materials.length - 1
  }

  const doc = {
    asset: {version: "2.0", generator: "Industrial Sketch"},
    scene: 0,
    scenes: [{name, nodes: nodes.map((_n, i) => i)}],
    nodes,
    meshes: gltfMeshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{byteLength, uri: name + ".bin"}]
  }
  return {gltf: JSON.stringify(doc, null, 1), binBase64: wrap(base64(bytes), 76), triangleCount}
}

export interface StlExport {
  stl: string
  triangleCount: number
}

export function exportStl(items: SketchItem[], name: string = "industrial_sketch"): StlExport {
  const lines: string[] = ["solid " + name]
  let triangleCount = 0
  for (const m of bakeItems(items)) {
    const p = (i: number) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = p(m.indices[t])
      const b = p(m.indices[t + 1])
      const c = p(m.indices[t + 2])
      const ux = b[0] - a[0]
      const uy = b[1] - a[1]
      const uz = b[2] - a[2]
      const vx = c[0] - a[0]
      const vy = c[1] - a[1]
      const vz = c[2] - a[2]
      let nx = uy * vz - uz * vy
      let ny = uz * vx - ux * vz
      let nz = ux * vy - uy * vx
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (len < 1e-12) {
        continue
      }
      nx /= len
      ny /= len
      nz /= len
      lines.push(
        // Y-up -> Z-up is the rotation (x, y, z) -> (x, -z, y), so winding and normals stay valid.
        "facet normal " + num(nx) + " " + num(-nz) + " " + num(ny),
        "outer loop",
        ...[a, b, c].map(
          (v) => "vertex " + num(v[0] * CM_TO_MM) + " " + num(-v[2] * CM_TO_MM) + " " + num(v[1] * CM_TO_MM)
        ),
        "endloop",
        "endfacet"
      )
      triangleCount++
    }
  }
  lines.push("endsolid " + name)
  return {stl: lines.join("\n"), triangleCount}
}

/** Bounds must match the float32 data exactly, so round them the same way. */
function fround3(v: number[]): number[] {
  return v.map((x) => Math.fround(x))
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

export function base64(bytes: Uint8Array): string {
  const out: string[] = []
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63])
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + "==")
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=")
  }
  return out.join("")
}

function wrap(text: string, width: number): string {
  const lines: string[] = []
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.slice(i, i + width))
  }
  return lines.join("\n")
}
