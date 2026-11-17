/**
 * SPECS Inc. 2027
 * Wavefront OBJ/MTL export of a sketch (one object per item, one material per color + finish).
 * Units are centimeters, Y up.
 */
import {SketchItem} from "../Core/SketchTypes"
import {bakeItems, finishParameters, num} from "./ExportMeshes"

export interface ObjExport {
  obj: string
  mtl: string
  vertexCount: number
  triangleCount: number
}

export function exportObj(items: SketchItem[], name: string = "industrial_sketch"): ObjExport {
  const obj: string[] = ["# Industrial Sketch export", "# units: cm, +Y up", "mtllib " + name + ".mtl"]
  const mtl: string[] = ["# Industrial Sketch materials"]
  const materials = new Set<string>()
  let offset = 1
  let vertexCount = 0
  let triangleCount = 0

  for (const mesh of bakeItems(items)) {
    const item = mesh.item
    obj.push("o " + mesh.name)
    if (!materials.has(mesh.materialName)) {
      materials.add(mesh.materialName)
      const [r, g, b] = item.color
      const finish = finishParameters(item.material)
      mtl.push(
        "newmtl " + mesh.materialName,
        "Kd " + num(r) + " " + num(g) + " " + num(b),
        "Ns " + num((1 - finish.roughness) * 900),
        "Pm " + finish.metallic,
        "Pr " + num(finish.roughness),
        ""
      )
    }
    obj.push("usemtl " + mesh.materialName)
    const n = mesh.positions.length / 3
    for (let i = 0; i < n; i++) {
      obj.push(
        "v " + num(mesh.positions[i * 3]) + " " + num(mesh.positions[i * 3 + 1]) + " " + num(mesh.positions[i * 3 + 2])
      )
    }
    for (let i = 0; i < n; i++) {
      obj.push(
        "vn " + num(mesh.normals[i * 3]) + " " + num(mesh.normals[i * 3 + 1]) + " " + num(mesh.normals[i * 3 + 2])
      )
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] + offset
      const b = mesh.indices[i + 1] + offset
      const c = mesh.indices[i + 2] + offset
      obj.push("f " + a + "//" + a + " " + b + "//" + b + " " + c + "//" + c)
    }
    offset += n
    vertexCount += n
    triangleCount += mesh.indices.length / 3
  }
  return {obj: obj.join("\n"), mtl: mtl.join("\n"), vertexCount, triangleCount}
}
