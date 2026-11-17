import WorldCameraFinderProvider from "InteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

// Seconds each solver example stays on before the next one.
const DEFAULT_INTERVAL = 8
// Head size and its motion around its resting spot (cm, degrees). It rests beside and above the
// spot the examples were authored for, so it doesn't sit in front of the content it drives.
const HEAD_SIZE = 8
const HEAD_REST = new vec3(-1, 10, -30)
const HEAD_SWAY = 5
// Near/far swing, so distance-based solvers (scale, distance events) cross their ranges.
const HEAD_DEPTH_SWING = 30
const HEAD_YAW_DEGREES = 50
// The head faces the viewer, so whatever a solver places in front of it lands between the head and
// the viewer, in view, instead of behind it.
const HEAD_BASE_YAW_DEGREES = 180
// Sharp turn example: the head runs a zigzag of legs this long (cm) and this fast (s).
const ZIGZAG_LEG = 30
const ZIGZAG_LEG_TIME = 1.2
// How long "Sharp turn!" stays on after a detection (s).
const TURN_LABEL_TIME = 0.8
const LABEL_SIZE = 48
const TITLE_SIZE = 64
// Drawn after everything else and without depth test, so the labels are never hidden.
const LABEL_RENDER_ORDER = 1000
// Diagram colors: the head pose is a red sphere, the content the solvers move is blue.
const HEAD_COLOR = new vec4(0.9, 0.15, 0.15, 1)
const NOSE_COLOR = new vec4(0.45, 0.05, 0.05, 1)
const PANEL_COLOR = new vec4(0.2, 0.45, 1, 1)
// Low-poly, flat-shaded head: few segments so the facets read as a stylised head.
const HEAD_SEGMENTS = 8
// Facing arrows: the head's gaze, and the front of every object a solver moves.
const GAZE_COLOR = new vec4(1, 0.85, 0.2, 1)
const FRONT_COLOR = new vec4(1, 0.85, 0.2, 1)
const FRONT_ARROW_LENGTH = 0.8 // in the object's local units (its cube is 1 unit)
const FRONT_LABEL_SCALE = 0.25

type Billboard = {text: Text; offset: vec3}

/**
 * Shows the solver examples in third person, one after the other.
 *
 * Put it on the object that holds the solver examples (its children named like "[Billboard]").
 * A red "Head pose" sphere stands in for the user's head and is the only thing that moves: every solver
 * targets it, so the content follows, faces, scales or snaps to it through the solver's own
 * behavior; that content is drawn blue. In the sharp-turn example the head runs a zigzag, the sharp-turn cube tracks it and
 * shows "Sharp turn!" each time the solver detects a turn. The solver name floats above the head,
 * on top of everything and facing the user. Examples switch every `interval` seconds.
 */
@component
export class SolversShowcase extends BaseScriptComponent {
  @input
  @hint("Seconds each solver example is shown")
  interval: number = DEFAULT_INTERVAL

  @input
  @hint("Cycle through the examples automatically. Off: follow whichever example is enabled (e.g. by a carousel).")
  autoPlay: boolean = true

  private groups: SceneObject[] = []
  private index = -1
  private elapsed = 0
  private time = 0
  private head: SceneObject | null = null
  private title: Text | null = null
  private billboards: Billboard[] = []
  private zigzag = false
  private followers: SceneObject[] = []
  private turnLabel: Text | null = null
  private turnLabelTime = 0
  private recolored: RenderMeshVisual[] = []
  private turnListened: any[] = []
  private shrunk: SceneObject[] = []
  private decorated: SceneObject[] = []
  private arrow: RenderMesh | null = null

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  private start(): void {
    for (let i = 0; i < this.sceneObject.getChildrenCount(); i++) {
      const child = this.sceneObject.getChild(i)
      if (/^"?\[/.test(child.name)) {
        this.groups.push(child)
      }
    }
    if (this.groups.length === 0) {
      print("SolversShowcase: no solver examples under " + this.sceneObject.name)
      return
    }
    this.head = this.createHead()
    if (this.autoPlay) {
      this.groups.forEach((group) => {
        group.enabled = false
      })
      this.show(0)
    } else {
      this.follow()
    }
  }

  /** Without autoPlay, someone else enables one example at a time: retarget whenever it changes. */
  private follow(): void {
    const active = this.groups.findIndex((group) => group.enabled)
    if (active >= 0 && active !== this.index) {
      this.activate(active)
    }
  }

  private update(): void {
    if (!this.head || this.groups.length === 0) {
      return
    }
    const dt = getDeltaTime()
    this.time += dt
    this.moveHead(this.time)
    const headPosition = this.head.getTransform().getWorldPosition()
    // Beside the head on the viewer's right (the head faces the viewer), so the cube doesn't hide it.
    const besideHead = headPosition.add(this.head.getTransform().right.uniformScale(-HEAD_SIZE * 2))
    this.followers.forEach((follower) => follower.getTransform().setWorldPosition(besideHead))
    this.updateBillboards(headPosition)

    if (this.turnLabel) {
      this.turnLabelTime -= dt
      this.turnLabel.enabled = this.turnLabelTime > 0
    }
    if (this.autoPlay) {
      this.elapsed += dt
      if (this.elapsed >= this.interval) {
        this.show(this.index + 1)
      }
    } else {
      this.follow()
    }
  }

  /** The head sways, turns and moves nearer and further; in the sharp-turn example it zigzags. */
  private moveHead(t: number): void {
    const transform = (this.head as SceneObject).getTransform()
    if (this.zigzag) {
      const leg = Math.floor(t / ZIGZAG_LEG_TIME)
      const phase = (t % ZIGZAG_LEG_TIME) / ZIGZAG_LEG_TIME
      const x = (leg % 2 === 0 ? phase - 0.5 : 0.5 - phase) * ZIGZAG_LEG
      const y = (leg % 4 < 2 ? 1 : -1) * 0.25 * ZIGZAG_LEG * (phase - 0.5)
      transform.setLocalPosition(HEAD_REST.add(new vec3(x, y, 0)))
      transform.setLocalRotation(quat.angleAxis(HEAD_BASE_YAW_DEGREES * MathUtils.DegToRad, vec3.up()))
      return
    }
    transform.setLocalPosition(HEAD_REST.add(new vec3(HEAD_SWAY * Math.sin(t * 0.5), 0, HEAD_DEPTH_SWING * Math.sin(t * 0.35))))
    const yaw = HEAD_BASE_YAW_DEGREES + HEAD_YAW_DEGREES * Math.sin(t * 0.8)
    transform.setLocalRotation(quat.angleAxis(yaw * MathUtils.DegToRad, vec3.up()))
  }

  /** Keeps the labels above the head, facing the user. */
  private updateBillboards(headPosition: vec3): void {
    const cameraPosition = WorldCameraFinderProvider.getInstance().getWorldPosition()
    this.billboards.forEach((billboard) => {
      const transform = billboard.text.getSceneObject().getTransform()
      const position = headPosition.add(billboard.offset)
      transform.setWorldPosition(position)
      const toCamera = cameraPosition.sub(position)
      if (toCamera.length > 0.0001) {
        transform.setWorldRotation(quat.lookAt(toCamera.normalize(), vec3.up()))
      }
    })
  }

  private show(index: number): void {
    const count = this.groups.length
    if (this.index >= 0) {
      this.groups[this.index].enabled = false
    }
    const next = ((index % count) + count) % count
    // Enabling runs the solvers' onAwake right away; their targets are swapped before onStart.
    this.groups[next].enabled = true
    this.activate(next)
  }

  /** Makes `index` the example the head drives: retargets its solvers and updates the title. */
  private activate(index: number): void {
    this.followers = []
    this.zigzag = false
    if (this.turnLabel) {
      this.turnLabel.enabled = false
    }
    this.turnLabelTime = 0
    this.elapsed = 0
    this.time = 0
    this.index = index
    const group = this.groups[index]
    this.retarget(group)
    if (this.title) {
      this.title.text = this.displayName(group.name)
    }
  }

  /** Points every solver in the group at the head cube; the sharp-turn cube tracks the head. */
  private retarget(group: SceneObject): void {
    const head = this.head as SceneObject
    this.visit(group, (object) => {
      object.getComponents("Component.ScriptComponent").forEach((component) => {
        const script = component as any
        if (typeof script.addOnTurnListener === "function") {
          this.zigzag = true
          this.followers.push(object)
          this.paint(object, PANEL_COLOR)
          // The group is shown again on every cycle; listen only once per solver.
          if (this.turnListened.indexOf(script) < 0) {
            this.turnListened.push(script)
            script.addOnTurnListener(() => {
              this.turnLabelTime = TURN_LABEL_TIME
            })
          }
          return
        }
        if (script.target !== undefined) {
          script.target = head
          this.paint(object, PANEL_COLOR)
        }
        // Tethers: keep their content a couple of head sizes in front of the head (the authored
        // offsets are for the real camera, a metre away, which would put it out of view).
        if (script.offset !== undefined && script.lerpSpeed !== undefined && script.target !== undefined) {
          script.offset = new vec3(0, 0, -HEAD_SIZE * 2)
          // Their cube is sized for a metre away; at head scale it would cover the head.
          if (this.shrunk.indexOf(object) < 0) {
            this.shrunk.push(object)
            object.getTransform().setLocalScale(object.getTransform().getLocalScale().uniformScale(0.5))
          }
        }
        // Match transform: follow the head beside it, without copying the head's scale.
        if (script.scaleLerpSpeed !== undefined && script.positionOffset !== undefined) {
          script.scaleLerpSpeed = 0
          script.positionOffset = new vec3(0, -HEAD_SIZE * 2, 0)
        }
        // Rotation in between the head and the example's second box.
        if (script.target1 !== undefined) {
          script.target1 = head
          this.paint(object, PANEL_COLOR)
        }
      })
      object.getComponents("Component.LookAtComponent").forEach((lookAt) => {
        lookAt.target = head
        this.paint(object, PANEL_COLOR)
      })
    })
    if (this.zigzag && this.turnLabel === null) {
      this.turnLabel = this.sharpTurnLabel()
    }
  }

  /** A red sphere with a small "nose" pointing where it looks, plus the labels that float above it. */
  private createHead(): SceneObject {
    const head = global.scene.createSceneObject("HeadPose (camera)")
    head.setParent(this.sceneObject)
    const source = this.findMeshVisual()
    const sphere = this.lowPolySphereMesh()
    const addSphere = (name: string, diameter: number, position: vec3, color: vec4) => {
      const ball = global.scene.createSceneObject(name)
      ball.setParent(head)
      ball.getTransform().setLocalPosition(position)
      ball.getTransform().setLocalScale(vec3.one().uniformScale(diameter / 2))
      const visual = ball.createComponent("Component.RenderMeshVisual")
      visual.mesh = sphere
      if (source) {
        const material = this.tinted(source.mainMaterial, color)
        // Seen from any side, whatever the generated triangles' winding.
        material.mainPass.twoSided = true
        visual.mainMaterial = material
      }
    }
    addSphere("Head", HEAD_SIZE, vec3.zero(), HEAD_COLOR)
    // The camera looks down -Z, so the nose sits in front of the head on -Z.
    addSphere("Nose", HEAD_SIZE * 0.35, new vec3(0, 0, -HEAD_SIZE * 0.55), NOSE_COLOR)
    // Glasses: a dark bar across the face, so the head reads as a person wearing Specs.
    const glasses = global.scene.createSceneObject("Glasses")
    glasses.setParent(head)
    glasses.getTransform().setLocalPosition(new vec3(0, HEAD_SIZE * 0.12, -HEAD_SIZE * 0.45))
    glasses.getTransform().setLocalScale(new vec3(HEAD_SIZE * 0.9, HEAD_SIZE * 0.18, HEAD_SIZE * 0.12))
    if (source) {
      const visual = glasses.createComponent("Component.RenderMeshVisual")
      visual.mesh = this.boxMesh()
      visual.mainMaterial = this.tinted(source.mainMaterial, new vec4(0.12, 0.12, 0.14, 1))
    }
    // Gaze arrow: where the head looks (the camera looks down -Z).
    this.addArrow(head, new vec3(0, 0, -HEAD_SIZE * 0.6), quat.angleAxis(Math.PI, vec3.up()), HEAD_SIZE * 1.6, GAZE_COLOR, source)
    this.addBillboard("HeadLabel", "Head pose", LABEL_SIZE, new vec3(0, HEAD_SIZE * 0.9, 0))
    this.title = this.addBillboard("SolverTitle", "", TITLE_SIZE, new vec3(0, HEAD_SIZE * 1.5, 0))
    return head
  }

  private sharpTurnLabel(): Text {
    const label = this.addBillboard("SharpTurnLabel", "Sharp turn!", LABEL_SIZE, new vec3(0, HEAD_SIZE * 2.1, 0))
    label.textFill.color = new vec4(1, 0.85, 0.2, 1)
    label.enabled = false
    return label
  }

  private addBillboard(name: string, value: string, size: number, offset: vec3): Text {
    const object = global.scene.createSceneObject(name)
    object.setParent(this.sceneObject)
    const text = object.createComponent("Component.Text")
    text.text = value
    text.size = size
    text.horizontalAlignment = HorizontalAlignment.Center
    text.verticalAlignment = VerticalAlignment.Center
    text.textFill.color = new vec4(1, 1, 1, 1)
    text.depthTest = false
    text.renderOrder = LABEL_RENDER_ORDER
    this.billboards.push({text, offset})
    return text
  }

  /** Tints the object's own mesh (not its children) with a copy of its material. */
  private paint(object: SceneObject, color: vec4): void {
    this.decorate(object)
    const visual = object.getComponent("Component.RenderMeshVisual")
    if (visual && visual.mainMaterial && this.recolored.indexOf(visual) < 0) {
      visual.mainMaterial = this.tinted(visual.mainMaterial, color)
      this.recolored.push(visual)
    }
  }

  /**
   * Marks the front of an object a solver moves: an arrow out of its -Z face (the axis Look At and
   * Billboard turn toward their target) and a "FRONT" label on that face, so the behavior reads at a
   * glance: the front keeps turning toward the head.
   */
  private decorate(object: SceneObject): void {
    if (this.decorated.indexOf(object) >= 0) {
      return
    }
    this.decorated.push(object)
    const source = object.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
    const back = quat.angleAxis(Math.PI, vec3.up())
    this.addArrow(object, new vec3(0, 0, -0.5), back, FRONT_ARROW_LENGTH, FRONT_COLOR, source)
    const labelObject = global.scene.createSceneObject("FrontLabel")
    labelObject.setParent(object)
    labelObject.getTransform().setLocalPosition(new vec3(0, 0, -0.52))
    labelObject.getTransform().setLocalRotation(back)
    labelObject.getTransform().setLocalScale(vec3.one().uniformScale(FRONT_LABEL_SCALE))
    const label = labelObject.createComponent("Component.Text")
    label.text = "FRONT"
    label.size = 36
    label.horizontalAlignment = HorizontalAlignment.Center
    label.verticalAlignment = VerticalAlignment.Center
    label.textFill.color = new vec4(1, 1, 1, 1)
  }

  /** An arrow along the parent's local +Z (after `rotation`), from `position`, `length` long. */
  private addArrow(parent: SceneObject, position: vec3, rotation: quat, length: number, color: vec4, source: RenderMeshVisual | null): void {
    const arrow = global.scene.createSceneObject("Arrow")
    arrow.setParent(parent)
    arrow.getTransform().setLocalPosition(position)
    arrow.getTransform().setLocalRotation(rotation)
    arrow.getTransform().setLocalScale(vec3.one().uniformScale(length))
    const visual = arrow.createComponent("Component.RenderMeshVisual")
    visual.mesh = this.arrowMesh()
    if (source && source.mainMaterial) {
      const material = this.tinted(source.mainMaterial, color)
      material.mainPass.twoSided = true
      visual.mainMaterial = material
    }
  }

  private tinted(material: Material, color: vec4): Material {
    const copy = material.clone()
    const pass = copy.mainPass as any
    pass.baseColor = color
    return copy
  }

  private newBuilder(): MeshBuilder {
    const builder = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3},
      {name: "texture0", components: 2}
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    return builder
  }

  /** Appends one flat-shaded triangle (its own vertices, face normal). */
  private triangle(builder: MeshBuilder, a: vec3, b: vec3, c: vec3): void {
    let n = b.sub(a).cross(c.sub(a))
    n = n.length > 0 ? n.normalize() : vec3.up()
    const base = builder.getVerticesCount()
    for (const p of [a, b, c]) {
      builder.appendVerticesInterleaved([p.x, p.y, p.z, n.x, n.y, n.z, 0, 0])
    }
    builder.appendIndices([base, base + 1, base + 2])
  }

  /** Unit-radius, flat-shaded low-poly sphere (the head), built at runtime. */
  private lowPolySphereMesh(): RenderMesh {
    const builder = this.newBuilder()
    const rings = HEAD_SEGMENTS / 2
    const point = (r: number, s: number) => {
      const theta = (r / rings) * Math.PI
      const phi = (s / HEAD_SEGMENTS) * Math.PI * 2
      return new vec3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi))
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < HEAD_SEGMENTS; s++) {
        const a = point(r, s), b = point(r, s + 1), c = point(r + 1, s), d = point(r + 1, s + 1)
        if (r > 0) this.triangle(builder, a, b, c)
        if (r < rings - 1) this.triangle(builder, c, b, d)
      }
    }
    builder.updateMesh()
    return builder.getMesh()
  }

  /** Unit-length arrow along +Z (from 0 to 1): a thin shaft and a cone head. */
  private arrowMesh(): RenderMesh {
    if (this.arrow) {
      return this.arrow
    }
    const builder = this.newBuilder()
    const sides = 10
    const shaftRadius = 0.03
    const headRadius = 0.09
    const headStart = 0.7
    const ring = (radius: number, z: number, i: number) => {
      const a = (i / sides) * Math.PI * 2
      return new vec3(Math.cos(a) * radius, Math.sin(a) * radius, z)
    }
    for (let i = 0; i < sides; i++) {
      const a0 = ring(shaftRadius, 0, i), a1 = ring(shaftRadius, 0, i + 1)
      const b0 = ring(shaftRadius, headStart, i), b1 = ring(shaftRadius, headStart, i + 1)
      this.triangle(builder, a0, b0, a1)
      this.triangle(builder, a1, b0, b1)
      const h0 = ring(headRadius, headStart, i), h1 = ring(headRadius, headStart, i + 1)
      this.triangle(builder, h0, new vec3(0, 0, 1), h1)
      this.triangle(builder, h1, new vec3(0, 0, headStart), h0)
    }
    builder.updateMesh()
    this.arrow = builder.getMesh()
    return this.arrow
  }

  /** Unit cube centered on the origin. */
  private boxMesh(): RenderMesh {
    const builder = this.newBuilder()
    const h = 0.5
    const v = (x: number, y: number, z: number) => new vec3(x * h, y * h, z * h)
    const quad = (a: vec3, b: vec3, c: vec3, d: vec3) => {
      this.triangle(builder, a, b, c)
      this.triangle(builder, a, c, d)
    }
    quad(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1))
    quad(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1))
    quad(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1))
    quad(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1))
    quad(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1))
    quad(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1))
    builder.updateMesh()
    return builder.getMesh()
  }

  private findMeshVisual(): RenderMeshVisual | null {
    let found: RenderMeshVisual | null = null
    for (const group of this.groups) {
      this.visit(group, (object) => {
        if (!found) {
          const visual = object.getComponent("Component.RenderMeshVisual")
          if (visual && visual.mesh) {
            found = visual
          }
        }
      })
      if (found) {
        break
      }
    }
    return found
  }

  private displayName(name: string): string {
    const cleaned = name.replace(/["[\]]/g, "").split("-")[0].trim()
    // "DetectASharpTurnMovement" -> "Detect A Sharp Turn Movement"
    return cleaned.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
  }

  private visit(root: SceneObject, callback: (object: SceneObject) => void): void {
    callback(root)
    for (let i = 0; i < root.getChildrenCount(); i++) {
      this.visit(root.getChild(i), callback)
    }
  }
}
