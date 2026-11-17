/**
 * SPECS Inc. 2027
 * Engine-independent triangle mesh container and helpers for the Industrial Sketch lens.
 */
import {Bounds3, boundsValid, emptyBounds, P3} from "./Vec"

/**
 * Indexed triangle mesh with per-vertex normals, stored as flat arrays
 * (positions/normals are xyz triplets, indices are triangle triplets, counter-clockwise front faces).
 */
export class MeshData {
  positions: number[] = []
  normals: number[] = []
  indices: number[] = []

  get vertexCount(): number {
    return this.positions.length / 3
  }

  get triangleCount(): number {
    return this.indices.length / 3
  }

  addVertex(p: P3, n: P3): number {
    this.positions.push(p.x, p.y, p.z)
    this.normals.push(n.x, n.y, n.z)
    return this.positions.length / 3 - 1
  }

  addTriangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  /** Quad a-b-c-d in counter-clockwise order. */
  addQuad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d)
  }

  getPosition(i: number): P3 {
    return {x: this.positions[i * 3], y: this.positions[i * 3 + 1], z: this.positions[i * 3 + 2]}
  }

  /** Appends `other`, offsetting its indices. */
  append(other: MeshData): void {
    const offset = this.vertexCount
    for (let i = 0; i < other.positions.length; i++) {
      this.positions.push(other.positions[i])
      this.normals.push(other.normals[i])
    }
    for (let i = 0; i < other.indices.length; i++) {
      this.indices.push(other.indices[i] + offset)
    }
  }

  /** Appends a copy of this mesh's triangles facing the other way (for double-sided open surfaces). */
  addBackFaces(): void {
    const count = this.vertexCount
    for (let i = 0; i < count; i++) {
      this.positions.push(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2])
      this.normals.push(-this.normals[i * 3], -this.normals[i * 3 + 1], -this.normals[i * 3 + 2])
    }
    const triangles = this.indices.length
    for (let i = 0; i < triangles; i += 3) {
      this.indices.push(this.indices[i] + count, this.indices[i + 2] + count, this.indices[i + 1] + count)
    }
  }

  /** Recomputes area-weighted smooth normals from the triangles. */
  computeSmoothNormals(): void {
    const n = new Array<number>(this.positions.length).fill(0)
    const p = this.positions
    for (let i = 0; i < this.indices.length; i += 3) {
      const a = this.indices[i] * 3
      const b = this.indices[i + 1] * 3
      const c = this.indices[i + 2] * 3
      const abx = p[b] - p[a]
      const aby = p[b + 1] - p[a + 1]
      const abz = p[b + 2] - p[a + 2]
      const acx = p[c] - p[a]
      const acy = p[c + 1] - p[a + 1]
      const acz = p[c + 2] - p[a + 2]
      const nx = aby * acz - abz * acy
      const ny = abz * acx - abx * acz
      const nz = abx * acy - aby * acx
      for (const v of [a, b, c]) {
        n[v] += nx
        n[v + 1] += ny
        n[v + 2] += nz
      }
    }
    for (let i = 0; i < n.length; i += 3) {
      const len = Math.sqrt(n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2])
      if (len > 1e-12) {
        n[i] /= len
        n[i + 1] /= len
        n[i + 2] /= len
      } else {
        n[i] = 0
        n[i + 1] = 1
        n[i + 2] = 0
      }
    }
    this.normals = n
  }

  computeBounds(): Bounds3 {
    const b = emptyBounds()
    const p = this.positions
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] < b.min.x) b.min.x = p[i]
      if (p[i + 1] < b.min.y) b.min.y = p[i + 1]
      if (p[i + 2] < b.min.z) b.min.z = p[i + 2]
      if (p[i] > b.max.x) b.max.x = p[i]
      if (p[i + 1] > b.max.y) b.max.y = p[i + 1]
      if (p[i + 2] > b.max.z) b.max.z = p[i + 2]
    }
    return boundsValid(b) ? b : {min: {x: 0, y: 0, z: 0}, max: {x: 0, y: 0, z: 0}}
  }

  /**
   * Splits the mesh into chunks that each fit a 16-bit index buffer.
   * Triangles are kept whole; shared vertices are duplicated across chunks as needed.
   */
  splitForUInt16(maxVertices: number = 65000): MeshData[] {
    if (this.vertexCount <= maxVertices) {
      return [this]
    }
    const chunks: MeshData[] = []
    let current = new MeshData()
    let remap = new Map<number, number>()
    const take = (src: number): number => {
      let dst = remap.get(src)
      if (dst === undefined) {
        dst = current.vertexCount
        current.positions.push(this.positions[src * 3], this.positions[src * 3 + 1], this.positions[src * 3 + 2])
        current.normals.push(this.normals[src * 3], this.normals[src * 3 + 1], this.normals[src * 3 + 2])
        remap.set(src, dst)
      }
      return dst
    }
    for (let i = 0; i < this.indices.length; i += 3) {
      if (current.vertexCount + 3 > maxVertices) {
        chunks.push(current)
        current = new MeshData()
        remap = new Map<number, number>()
      }
      current.indices.push(take(this.indices[i]), take(this.indices[i + 1]), take(this.indices[i + 2]))
    }
    if (current.indices.length > 0) {
      chunks.push(current)
    }
    return chunks
  }
}
