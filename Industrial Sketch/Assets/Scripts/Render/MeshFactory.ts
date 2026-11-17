/**
 * SPECS Inc. 2027
 * Uploads kernel MeshData to Lens Studio RenderMesh assets through MeshBuilder.
 */
import {MeshData} from "../Geometry/MeshData"

/** Builds one RenderMesh per 16-bit-indexable chunk of `data`. Empty meshes yield an empty list. */
export function toRenderMeshes(data: MeshData): RenderMesh[] {
  if (data.triangleCount === 0) {
    return []
  }
  const out: RenderMesh[] = []
  for (const chunk of data.splitForUInt16()) {
    const builder = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3, normalized: true},
      {name: "texture0", components: 2}
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    const count = chunk.vertexCount
    const interleaved = new Array<number>(count * 8)
    for (let i = 0; i < count; i++) {
      interleaved[i * 8] = chunk.positions[i * 3]
      interleaved[i * 8 + 1] = chunk.positions[i * 3 + 1]
      interleaved[i * 8 + 2] = chunk.positions[i * 3 + 2]
      interleaved[i * 8 + 3] = chunk.normals[i * 3]
      interleaved[i * 8 + 4] = chunk.normals[i * 3 + 1]
      interleaved[i * 8 + 5] = chunk.normals[i * 3 + 2]
      interleaved[i * 8 + 6] = 0
      interleaved[i * 8 + 7] = 0
    }
    builder.appendVerticesInterleaved(interleaved)
    builder.appendIndices(chunk.indices)
    if (builder.isValid()) {
      builder.updateMesh()
      out.push(builder.getMesh())
    }
  }
  return out
}

/**
 * A scene object that displays a MeshData, growing or shrinking its RenderMeshVisual count with the chunks.
 */
export class MeshDisplay {
  readonly sceneObject: SceneObject
  private visuals: RenderMeshVisual[] = []
  private material: Material | null = null

  constructor(parent: SceneObject, name: string) {
    this.sceneObject = global.scene.createSceneObject(name)
    this.sceneObject.setParent(parent)
  }

  setMeshes(meshes: RenderMesh[]): void {
    while (this.visuals.length < meshes.length) {
      const visual = this.sceneObject.createComponent("Component.RenderMeshVisual")
      if (this.material) {
        visual.mainMaterial = this.material
      }
      this.visuals.push(visual)
    }
    for (let i = 0; i < this.visuals.length; i++) {
      if (i < meshes.length) {
        this.visuals[i].mesh = meshes[i]
        this.visuals[i].enabled = true
      } else {
        this.visuals[i].enabled = false
      }
    }
  }

  setMesh(data: MeshData): void {
    this.setMeshes(toRenderMeshes(data))
  }

  setMaterial(material: Material): void {
    if (this.material === material) {
      return
    }
    this.material = material
    for (const v of this.visuals) {
      v.mainMaterial = material
    }
  }

  set enabled(value: boolean) {
    this.sceneObject.enabled = value
  }

  get enabled(): boolean {
    return this.sceneObject.enabled
  }

  destroy(): void {
    this.sceneObject.destroy()
    this.visuals = []
  }
}

/**
 * A mesh that is rewritten in place (same RenderMesh asset) — for per-frame previews and gizmos.
 * Content beyond one 16-bit index buffer is truncated.
 */
export class DynamicMesh {
  readonly sceneObject: SceneObject
  private builder: MeshBuilder
  private visual: RenderMeshVisual

  constructor(parent: SceneObject | null, name: string, material: Material) {
    this.sceneObject = global.scene.createSceneObject(name)
    if (parent) {
      this.sceneObject.setParent(parent)
    }
    this.builder = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3, normalized: true},
      {name: "texture0", components: 2}
    ])
    this.builder.topology = MeshTopology.Triangles
    this.builder.indexType = MeshIndexType.UInt16
    this.visual = this.sceneObject.createComponent("Component.RenderMeshVisual")
    this.visual.mainMaterial = material
    this.sceneObject.enabled = false
  }

  setMaterial(material: Material): void {
    if (this.visual.mainMaterial !== material) {
      this.visual.mainMaterial = material
    }
  }

  update(data: MeshData): void {
    const chunk = data.splitForUInt16()[0]
    if (!chunk || chunk.triangleCount === 0) {
      this.sceneObject.enabled = false
      return
    }
    const vertices = this.builder.getVerticesCount()
    if (vertices > 0) {
      this.builder.eraseVertices(0, vertices)
    }
    const indices = this.builder.getIndicesCount()
    if (indices > 0) {
      this.builder.eraseIndices(0, indices)
    }
    const count = chunk.vertexCount
    const interleaved = new Array<number>(count * 8)
    for (let i = 0; i < count; i++) {
      interleaved[i * 8] = chunk.positions[i * 3]
      interleaved[i * 8 + 1] = chunk.positions[i * 3 + 1]
      interleaved[i * 8 + 2] = chunk.positions[i * 3 + 2]
      interleaved[i * 8 + 3] = chunk.normals[i * 3]
      interleaved[i * 8 + 4] = chunk.normals[i * 3 + 1]
      interleaved[i * 8 + 5] = chunk.normals[i * 3 + 2]
      interleaved[i * 8 + 6] = 0
      interleaved[i * 8 + 7] = 0
    }
    this.builder.appendVerticesInterleaved(interleaved)
    this.builder.appendIndices(chunk.indices)
    if (this.builder.isValid()) {
      this.builder.updateMesh()
      this.visual.mesh = this.builder.getMesh()
      this.sceneObject.enabled = true
    } else {
      this.sceneObject.enabled = false
    }
  }

  clear(): void {
    this.sceneObject.enabled = false
  }

  destroy(): void {
    this.sceneObject.destroy()
  }
}
