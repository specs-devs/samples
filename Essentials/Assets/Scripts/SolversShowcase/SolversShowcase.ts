import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

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
const SPHERE_SEGMENTS = 24

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
    const sphere = this.sphereMesh()
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
    const visual = object.getComponent("Component.RenderMeshVisual")
    if (visual && visual.mainMaterial && this.recolored.indexOf(visual) < 0) {
      visual.mainMaterial = this.tinted(visual.mainMaterial, color)
      this.recolored.push(visual)
    }
  }

  private tinted(material: Material, color: vec4): Material {
    const copy = material.clone()
    const pass = copy.mainPass as any
    pass.baseColor = color
    return copy
  }

  /** Unit-radius UV sphere, built at runtime so no mesh asset needs wiring. */
  private sphereMesh(): RenderMesh {
    const builder = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3},
      {name: "texture0", components: 2}
    ])
    builder.topology = MeshTopology.Triangles
    builder.indexType = MeshIndexType.UInt16
    const rings = SPHERE_SEGMENTS / 2
    for (let r = 0; r <= rings; r++) {
      const theta = (r / rings) * Math.PI
      for (let s = 0; s <= SPHERE_SEGMENTS; s++) {
        const phi = (s / SPHERE_SEGMENTS) * Math.PI * 2
        const x = Math.sin(theta) * Math.cos(phi)
        const y = Math.cos(theta)
        const z = Math.sin(theta) * Math.sin(phi)
        builder.appendVerticesInterleaved([x, y, z, x, y, z, s / SPHERE_SEGMENTS, r / rings])
      }
    }
    const row = SPHERE_SEGMENTS + 1
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < SPHERE_SEGMENTS; s++) {
        const a = r * row + s
        const b = a + row
        builder.appendIndices([a, a + 1, b, b, a + 1, b + 1])
      }
    }
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
