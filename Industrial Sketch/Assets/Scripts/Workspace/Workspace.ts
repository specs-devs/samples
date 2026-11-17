/**
 * SPECS Inc. 2027
 * The sketch workspace: the root every item lives under, world navigation (move / rotate / scale the whole
 * sketch with one or two hands), the construction grid, the scale-reference mannequin and presentation mode.
 */
import {AppState} from "../Core/AppState"
import {clamp, yawBetween} from "../Core/LensMath"
import {MaterialPreset, Viewpoint} from "../Core/SketchTypes"
import {MeshData} from "../Geometry/MeshData"
import {buildCapsule, buildSphere} from "../Geometry/Primitives"
import {GizmoColors} from "../Render/Gizmos"
import {MaterialLibrary} from "../Render/MaterialLibrary"
import {MeshDisplay} from "../Render/MeshFactory"

/** Where the sketch appears relative to the head on start / reset (cm). */
const SPAWN_DISTANCE = 60
const SPAWN_DROP = 14
const MIN_SCALE = 0.02
const MAX_SCALE = 25
const GRID_HALF_EXTENT = 40
const PRESENTATION_SPEED = 0.2 // rad/s

interface NavStart {
  twoHanded: boolean
  a: vec3
  b: vec3
  handForward: vec3
  position: vec3
  rotation: quat
  scale: number
}

export class Workspace {
  readonly root: SceneObject
  private readonly rootTransform: Transform
  private grid: MeshDisplay
  private mannequin: MeshDisplay
  private nav: NavStart | null = null

  constructor(
    private readonly camera: Transform,
    private readonly state: AppState,
    private readonly materials: MaterialLibrary
  ) {
    this.root = global.scene.createSceneObject("Sketch Root")
    this.rootTransform = this.root.getTransform()
    this.grid = new MeshDisplay(this.root, "Grid")
    this.grid.setMaterial(materials.unlit(GizmoColors.guide))
    this.mannequin = new MeshDisplay(this.root, "Mannequin")
    this.mannequin.setMaterial(materials.get([0.62, 0.64, 0.68], MaterialPreset.Matte))
    this.mannequin.setMesh(buildMannequin())
    this.mannequin.sceneObject.getTransform().setLocalPosition(new vec3(70, 0, -10))
    this.rebuildGrid()
    this.refreshVisibility()
    state.onChanged.add((key) => {
      if (key === "gridStep") {
        this.rebuildGrid()
      }
      if (key === "showGrid" || key === "showMannequin" || key === "presentation") {
        this.refreshVisibility()
      }
    })
  }

  /** Current uniform scale of the sketch (1 = life size). */
  get scale(): number {
    return this.rootTransform.getWorldScale().x
  }

  get isNavigating(): boolean {
    return this.nav !== null
  }

  get isTwoHandNavigating(): boolean {
    return !!this.nav && this.nav.twoHanded
  }

  worldToRoot(p: vec3): vec3 {
    return this.rootTransform.getInvertedWorldTransform().multiplyPoint(p)
  }

  rootToWorld(p: vec3): vec3 {
    return this.rootTransform.getWorldTransform().multiplyPoint(p)
  }

  /** World direction -> root direction (unit length). */
  worldDirToRoot(v: vec3): vec3 {
    return this.rootTransform.getWorldRotation().invert().multiplyVec3(v).normalize()
  }

  rootDirToWorld(v: vec3): vec3 {
    return this.rootTransform.getWorldRotation().multiplyVec3(v).normalize()
  }

  /** World rotation -> rotation relative to the root. */
  worldRotToRoot(q: quat): quat {
    return this.rootTransform.getWorldRotation().invert().multiply(q)
  }

  /** Places the sketch in front of the user at life size. */
  resetView(): void {
    const head = this.camera.getWorldPosition()
    let forward = this.camera.back
    forward = new vec3(forward.x, 0, forward.z)
    forward = forward.length > 1e-3 ? forward.normalize() : new vec3(0, 0, -1)
    const position = head.add(forward.uniformScale(SPAWN_DISTANCE)).add(new vec3(0, -SPAWN_DROP, 0))
    this.rootTransform.setWorldPosition(position)
    // Root +Z faces the user so "front" views read naturally.
    this.rootTransform.setWorldRotation(quat.lookAt(forward.uniformScale(-1), vec3.up()))
    this.rootTransform.setWorldScale(vec3.one())
  }

  /** Sets life-size scale while keeping the point under the head-forward ray fixed. */
  setScale(scale: number): void {
    const s = clamp(scale, MIN_SCALE, MAX_SCALE)
    const pivot = this.camera.getWorldPosition().add(this.camera.back.uniformScale(SPAWN_DISTANCE))
    const local = this.worldToRoot(pivot)
    this.rootTransform.setWorldScale(new vec3(s, s, s))
    const moved = this.rootToWorld(local)
    this.rootTransform.setWorldPosition(this.rootTransform.getWorldPosition().add(pivot.sub(moved)))
  }

  /** Scales and moves the sketch so the given root-space bounds fill a comfortable view in front of the user. */
  frameBounds(min: vec3, max: vec3): void {
    const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1)
    const target = 45
    const s = clamp(target / size, MIN_SCALE, MAX_SCALE)
    this.resetView()
    this.rootTransform.setWorldScale(new vec3(s, s, s))
    const center = min.add(max).uniformScale(0.5)
    const head = this.camera.getWorldPosition()
    let forward = this.camera.back
    forward = new vec3(forward.x, 0, forward.z)
    forward = forward.length > 1e-3 ? forward.normalize() : new vec3(0, 0, -1)
    const desired = head.add(forward.uniformScale(SPAWN_DISTANCE)).add(new vec3(0, -10, 0))
    const current = this.rootToWorld(center)
    this.rootTransform.setWorldPosition(this.rootTransform.getWorldPosition().add(desired.sub(current)))
  }

  /** The current view of the sketch: head position and heading in sketch space, and the view scale. */
  captureViewpoint(): Viewpoint {
    const head = this.worldToRoot(this.camera.getWorldPosition())
    const forward = this.worldDirToRoot(flatForward(this.camera))
    return {
      position: {x: head.x, y: head.y, z: head.z},
      yaw: Math.atan2(forward.x, forward.z),
      scale: this.scale
    }
  }

  /**
   * Moves, turns and scales the sketch so the user sees it from a saved viewpoint. In AR the user can't be
   * moved, so the sketch moves instead: the saved head position lands on the current head.
   */
  applyViewpoint(v: Viewpoint): void {
    this.nav = null
    const s = clamp(v.scale, MIN_SCALE, MAX_SCALE)
    const forward = flatForward(this.camera)
    const rotation = quat.angleAxis(Math.atan2(forward.x, forward.z) - v.yaw, vec3.up())
    const head = this.camera.getWorldPosition()
    const offset = rotation.multiplyVec3(new vec3(v.position.x, v.position.y, v.position.z).uniformScale(s))
    this.rootTransform.setWorldScale(new vec3(s, s, s))
    this.rootTransform.setWorldRotation(rotation)
    this.rootTransform.setWorldPosition(head.sub(offset))
  }

  /** Starts navigating with one hand at `a` (world). */
  beginNavigation(a: vec3, handForward: vec3): void {
    this.nav = {
      twoHanded: false,
      a,
      b: a,
      handForward,
      position: this.rootTransform.getWorldPosition(),
      rotation: this.rootTransform.getWorldRotation(),
      scale: this.scale
    }
  }

  /** Upgrades (or starts) navigation to two hands at `a` and `b`. */
  beginTwoHandNavigation(a: vec3, b: vec3): void {
    this.nav = {
      twoHanded: true,
      a,
      b,
      handForward: vec3.forward(),
      position: this.rootTransform.getWorldPosition(),
      rotation: this.rootTransform.getWorldRotation(),
      scale: this.scale
    }
  }

  /** Updates navigation. For one-handed navigation pass only `a` and the hand forward. */
  updateNavigation(a: vec3, b: vec3 | null, handForward: vec3): void {
    const nav = this.nav
    if (!nav) {
      return
    }
    if (nav.twoHanded && b) {
      const m0 = nav.a.add(nav.b).uniformScale(0.5)
      const m = a.add(b).uniformScale(0.5)
      const v0 = nav.b.sub(nav.a)
      const v = b.sub(a)
      const ratio = v0.length > 1 ? v.length / v0.length : 1
      const newScale = clamp(nav.scale * ratio, MIN_SCALE, MAX_SCALE)
      const s = newScale / nav.scale
      const yaw = yawBetween(new vec3(v0.x, 0, v0.z), new vec3(v.x, 0, v.z))
      const r = quat.angleAxis(yaw, vec3.up())
      const offset = r.multiplyVec3(nav.position.sub(m0).uniformScale(s))
      this.rootTransform.setWorldScale(new vec3(newScale, newScale, newScale))
      this.rootTransform.setWorldRotation(r.multiply(nav.rotation))
      this.rootTransform.setWorldPosition(m.add(offset))
    } else {
      // One hand: translate with the hand, yaw with the hand's heading (about the hand).
      const yaw = yawBetween(
        new vec3(nav.handForward.x, 0, nav.handForward.z),
        new vec3(handForward.x, 0, handForward.z)
      )
      const r = quat.angleAxis(yaw * 0.6, vec3.up())
      const offset = r.multiplyVec3(nav.position.sub(nav.a))
      this.rootTransform.setWorldRotation(r.multiply(nav.rotation))
      this.rootTransform.setWorldPosition(a.add(offset))
    }
  }

  endNavigation(): void {
    this.nav = null
  }

  /** Called every frame. Presentation mode turns the sketch slowly around its own origin. */
  update(dt: number): void {
    if (this.state.presentation && !this.nav) {
      const r = quat.angleAxis(PRESENTATION_SPEED * dt, vec3.up())
      this.rootTransform.setWorldRotation(r.multiply(this.rootTransform.getWorldRotation()))
    }
  }

  private refreshVisibility(): void {
    this.grid.enabled = this.state.showGrid && !this.state.presentation
    this.mannequin.enabled = this.state.showMannequin
  }

  private rebuildGrid(): void {
    const mesh = new MeshData()
    const step = Math.max(0.5, this.state.gridStep)
    // Keep the line count reasonable for fine steps by drawing minor lines only near the center.
    const lines = Math.min(80, Math.floor(GRID_HALF_EXTENT / step))
    const extent = lines * step
    const thin = 0.05
    const thick = 0.12
    for (let i = -lines; i <= lines; i++) {
      const major = i % 5 === 0
      const w = major ? thick : thin
      const v = i * step
      addFlatBar(mesh, -extent, v, extent, v, w, true)
      addFlatBar(mesh, v, -extent, v, extent, w, false)
    }
    this.grid.setMesh(mesh)
  }
}

/** The camera's viewing direction projected on the horizontal plane. */
function flatForward(camera: Transform): vec3 {
  const f = camera.back
  const flat = new vec3(f.x, 0, f.z)
  return flat.length > 1e-3 ? flat.normalize() : new vec3(0, 0, -1)
}

/** Adds a thin flat bar on the y = 0 plane from (x0, z0) to (x1, z1), visible from above and below. */
function addFlatBar(
  mesh: MeshData,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  width: number,
  alongX: boolean
): void {
  const h = width / 2
  const up = {x: 0, y: 1, z: 0}
  const base = mesh.vertexCount
  if (alongX) {
    mesh.addVertex({x: x0, y: 0, z: z0 - h}, up)
    mesh.addVertex({x: x1, y: 0, z: z1 - h}, up)
    mesh.addVertex({x: x1, y: 0, z: z1 + h}, up)
    mesh.addVertex({x: x0, y: 0, z: z0 + h}, up)
  } else {
    mesh.addVertex({x: x0 - h, y: 0, z: z0}, up)
    mesh.addVertex({x: x0 + h, y: 0, z: z0}, up)
    mesh.addVertex({x: x1 + h, y: 0, z: z1}, up)
    mesh.addVertex({x: x1 - h, y: 0, z: z1}, up)
  }
  mesh.addQuad(base, base + 3, base + 2, base + 1)
  mesh.addQuad(base, base + 1, base + 2, base + 3)
}

/** A simple 175 cm reference figure built from capsules, standing on y = 0 and facing +Z. */
function buildMannequin(): MeshData {
  const out = new MeshData()
  const capsule = buildCapsule(16, 6, 0.25)
  const sphere = buildSphere(16, 12)
  const place = (
    src: MeshData,
    center: [number, number, number],
    size: [number, number, number],
    tiltZ: number = 0
  ) => {
    const c = Math.cos(tiltZ)
    const s = Math.sin(tiltZ)
    const part = new MeshData()
    for (let i = 0; i < src.vertexCount; i++) {
      const p = src.getPosition(i)
      const x = p.x * size[0]
      const y = p.y * size[1]
      const z = p.z * size[2]
      const nx = src.normals[i * 3] / size[0]
      const ny = src.normals[i * 3 + 1] / size[1]
      const nz = src.normals[i * 3 + 2] / size[2]
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
      part.addVertex(
        {x: center[0] + x * c - y * s, y: center[1] + x * s + y * c, z: center[2] + z},
        {x: (nx * c - ny * s) / nl, y: (nx * s + ny * c) / nl, z: nz / nl}
      )
    }
    part.indices = src.indices.slice()
    out.append(part)
  }
  place(sphere, [0, 162, 0], [20, 23, 21]) // head
  place(capsule, [0, 147, 0], [10, 12, 10]) // neck
  place(capsule, [0, 118, 0], [36, 48, 21]) // torso
  place(capsule, [0, 92, 0], [33, 22, 20]) // pelvis
  place(capsule, [-10, 62, 0], [14, 44, 14]) // left thigh
  place(capsule, [10, 62, 0], [14, 44, 14])
  place(capsule, [-10, 24, 0], [10, 44, 10]) // left shin
  place(capsule, [10, 24, 0], [10, 44, 10])
  place(capsule, [-10, 3, 6], [10, 6, 26]) // feet
  place(capsule, [10, 3, 6], [10, 6, 26])
  place(capsule, [-23, 120, 0], [9, 32, 9], -0.12) // upper arms
  place(capsule, [23, 120, 0], [9, 32, 9], 0.12)
  place(capsule, [-27, 92, 0], [8, 30, 8], -0.05) // forearms
  place(capsule, [27, 92, 0], [8, 30, 8], 0.05)
  return out
}
