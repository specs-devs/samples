/**
 * SPECS Inc. 2027
 * Shared export step: bakes each exportable item into a mesh in sketch-root space (cm, +Y up), and streams text
 * exports to the Logger. Lenses cannot write files, so with the device connected the export is copied from the
 * Lens Studio Logger panel into files.
 */
import {buildItemMesh} from "../Core/ItemGeometry"
import {arrayToQuat} from "../Core/LensMath"
import {ItemKind, MaterialPreset, SketchItem} from "../Core/SketchTypes"

export interface BakedMesh {
  item: SketchItem
  /** Unique object name, e.g. "stroke_3". */
  name: string
  /** Material name shared by items with the same color and finish. */
  materialName: string
  /** x, y, z per vertex in sketch-root space (cm). */
  positions: number[]
  /** Unit normals per vertex. */
  normals: number[]
  indices: number[]
}

/** Notes and dimension lines are review annotations, not geometry: they are not exported. */
export function isExportable(item: SketchItem): boolean {
  return item.kind !== ItemKind.Note && item.kind !== ItemKind.Measure
}

export function materialName(item: SketchItem): string {
  const c = item.color
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")
  return item.material + "_" + c
}

/** PBR parameters of a finish, for formats that store them. */
export function finishParameters(material: MaterialPreset): {metallic: number; roughness: number} {
  const metal = material === MaterialPreset.Metal || material === MaterialPreset.Chrome
  const roughness =
    material === MaterialPreset.Gloss || material === MaterialPreset.Chrome
      ? 0.1
      : material === MaterialPreset.Matte
        ? 0.9
        : 0.5
  return {metallic: metal ? 1 : 0, roughness}
}

export function bakeItems(items: SketchItem[]): BakedMesh[] {
  const out: BakedMesh[] = []
  items.forEach((item, index) => {
    if (!isExportable(item)) {
      return
    }
    const mesh = buildItemMesh(item)
    if (mesh.triangleCount === 0) {
      return
    }
    const t = item.transform
    const q = arrayToQuat(t.rotation)
    const pos = new vec3(t.position.x, t.position.y, t.position.z)
    const positions: number[] = []
    const normals: number[] = []
    for (let i = 0; i < mesh.vertexCount; i++) {
      const p = mesh.getPosition(i)
      const w = q.multiplyVec3(new vec3(p.x * t.scale.x, p.y * t.scale.y, p.z * t.scale.z)).add(pos)
      positions.push(w.x, w.y, w.z)
      // Normals transform by the inverse-transpose; for these scales dividing by scale is enough.
      const n = q.multiplyVec3(
        new vec3(
          mesh.normals[i * 3] / (t.scale.x || 1),
          mesh.normals[i * 3 + 1] / (t.scale.y || 1),
          mesh.normals[i * 3 + 2] / (t.scale.z || 1)
        )
      )
      // Degenerate normals (zero length) would become NaN: fall back to +Y.
      if (n.length < 1e-6) {
        normals.push(0, 1, 0)
      } else {
        const u = n.normalize()
        normals.push(u.x, u.y, u.z)
      }
    }
    // Mirrored items (negative scale on an odd number of axes) need their winding flipped.
    const flip = t.scale.x * t.scale.y * t.scale.z < 0
    const indices: number[] = []
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i]
      const b = mesh.indices[i + 1]
      const c = mesh.indices[i + 2]
      if (flip) {
        indices.push(a, c, b)
      } else {
        indices.push(a, b, c)
      }
    }
    out.push({item, name: item.kind + "_" + (index + 1), materialName: materialName(item), positions, normals, indices})
  })
  return out
}

/** Prints text files to the Logger between BEGIN/END markers, in chunks small enough for the log transport. */
export function printFiles(files: {name: string; text: string}[]): void {
  for (const file of files) {
    print("----- BEGIN " + file.name + " -----")
    let buf: string[] = []
    let size = 0
    for (const line of file.text.split("\n")) {
      buf.push(line)
      size += line.length + 1
      if (size > 3000) {
        print(buf.join("\n"))
        buf = []
        size = 0
      }
    }
    if (buf.length > 0) {
      print(buf.join("\n"))
    }
    print("----- END " + file.name + " -----")
  }
}

/** Formats a number compactly for text formats (micrometer precision at cm units). */
export function num(v: number): string {
  return (Math.round(v * 10000) / 10000).toString()
}
