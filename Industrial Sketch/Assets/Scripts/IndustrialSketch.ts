/**
 * SPECS Inc. 2027
 * Industrial Sketch — a hand-tracked 3D sketching and concept-modeling tool for SPECS.
 *
 * This component owns the app: it builds the document, workspace, tools and UI at runtime and routes the hands
 * every frame. Dominant hand: the active tool. Non-dominant hand: pinch in empty space to move/turn the sketch,
 * pinch with both hands to scale it. The palette (UI Kit) switches tools and settings.
 */
import WorldCameraFinderProvider from "InteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {CollabSession} from "./Collab/CollabSession"
import {AppState, ToolId} from "./Core/AppState"
import {itemToRoot} from "./Core/LensMath"
import {ChangeSource, SketchDocument} from "./Core/SketchDocument"
import {SketchItem, Viewpoint} from "./Core/SketchTypes"
import {SymmetryMode} from "./Geometry/Symmetry"
import {HandState, HandTracker} from "./Input/HandTracker"
import {bindPreviewShortcuts} from "./Input/PreviewShortcuts"
import {printFiles} from "./Persistence/ExportMeshes"
import {exportGltf, exportStl} from "./Persistence/GltfStlExporter"
import {exportObj} from "./Persistence/ObjExporter"
import {SketchStorage, SlotInfo} from "./Persistence/SketchStorage"
import {GizmoColors, Gizmos} from "./Render/Gizmos"
import {ItemViews} from "./Render/ItemViews"
import {MaterialLibrary} from "./Render/MaterialLibrary"
import {EraseTool, MeasureTool, PaintTool} from "./Tools/BrushTools"
import {EditTool} from "./Tools/EditTool"
import {GrabTool} from "./Tools/GrabTool"
import {NoteTool} from "./Tools/NoteTool"
import {PlaceTool} from "./Tools/PlaceTool"
import {SelectionActions} from "./Tools/SelectionActions"
import {StrokeTool} from "./Tools/StrokeTool"
import {SurfaceTool} from "./Tools/SurfaceTool"
import {Tool, ToolContext} from "./Tools/Tool"
import {Hud} from "./UI/Hud"
import {Palette, PaletteHost, VIEWPOINT_COUNT} from "./UI/Palette"
import {REFERENCE_MODELS, referenceItems} from "./Workspace/ReferenceLibrary"
import {Workspace} from "./Workspace/Workspace"

const AUTOSAVE_DELAY = 4

@component
export class IndustrialSketch extends BaseScriptComponent implements PaletteHost {
  @ui.label(
    '<span style="color: #60A5FA;">Industrial Sketch</span><br/><span style="color: #94A3B8; font-size: 11px;">Builds the whole app at runtime. Assign a lit (PBR) and an unlit material; everything else is created by script.</span>'
  )
  @ui.separator
  @input
  @hint("Lit material cloned for sketch geometry. Needs baseColor, metallic and roughness parameters.")
  pbrMaterial: Material

  @input
  @hint("Unlit material cloned for guides, handles and the 'Flat' finish. Needs a baseColor parameter.")
  unlitMaterial: Material

  @input
  @hint("Restore the autosaved sketch when the lens starts")
  restoreAutosave: boolean = true

  @input
  @hint("Optional SessionController-based collaboration (Sync Kit). Leave off for single-user use.")
  enableCollaboration: boolean = true

  @input
  @hint("Log hand routing and tool events to the Logger (for debugging)")
  debugLogging: boolean = false

  readonly state = new AppState()
  readonly doc = new SketchDocument()
  actions!: SelectionActions

  private materials!: MaterialLibrary
  private workspace!: Workspace
  private views!: ItemViews
  private gizmos!: Gizmos
  private hands!: HandTracker
  private ctx!: ToolContext
  private tools = new Map<ToolId, Tool>()
  private activeTool: Tool | null = null
  private paintTool!: PaintTool
  private palette!: Palette
  private hud!: Hud
  private storage!: SketchStorage
  private collab: CollabSession | null = null
  private camera!: Transform

  // Hand routing.
  private navHand: "nondominant" | null = null
  private dominantInNav = false
  private secondHandToTool = false

  private lastPalmFacing = false
  private slotCache: SlotInfo[] | null = null
  private lastChangeTime = -1
  private autosaveDirty = false
  private lastErrorTime = -10
  private started = false
  private viewpoints: (Viewpoint | null)[] = []
  /** A collaborator's shared view that arrived mid-gesture; applied once the hands are free. */
  private pendingView: {viewpoint: Viewpoint; from: string} | null = null

  onAwake(): void {
    if (!this.pbrMaterial || !this.unlitMaterial) {
      print("Industrial Sketch: assign the PBR and unlit materials on the IndustrialSketch component")
      return
    }
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  private start(): void {
    this.camera = WorldCameraFinderProvider.getInstance().getTransform()
    this.materials = new MaterialLibrary(this.pbrMaterial, this.unlitMaterial)
    this.workspace = new Workspace(this.camera, this.state, this.materials)
    this.views = new ItemViews(this.workspace.root, this.doc, this.materials, this.state)
    this.gizmos = new Gizmos(this.materials)
    this.hands = new HandTracker(this.camera)
    this.actions = new SelectionActions(this.doc, this.state)
    this.storage = new SketchStorage()
    this.ctx = new ToolContext(
      this.doc,
      this.state,
      this.views,
      this.workspace,
      this.gizmos,
      this.materials,
      this.hands
    )

    this.paintTool = new PaintTool()
    const tools: Tool[] = [
      new StrokeTool(),
      new SurfaceTool(),
      new PlaceTool(ToolId.Primitive),
      new PlaceTool(ToolId.SubD),
      new GrabTool(),
      new EditTool(),
      this.paintTool,
      new EraseTool(),
      new MeasureTool(),
      new NoteTool()
    ]
    for (const t of tools) {
      this.tools.set(t.id, t)
    }

    this.palette = new Palette(this.state, this.doc, this.materials, this, this.camera)
    this.hud = new Hud(this.camera, this.doc, this.workspace)

    this.state.onChanged.add((key) => {
      if (key === "tool") {
        this.switchTool()
      } else if (key === "dominantHand") {
        this.hands.setDominant(this.state.dominantHand)
        this.palette.placeDefault()
      } else if (key === "presentation") {
        this.state.selection = []
      }
    })
    this.state.onToast.add((m) => {
      this.hud.toast(m, getTime())
      if (this.debugLogging) {
        print("Industrial Sketch: toast: " + m)
      }
    })
    this.doc.onHistoryChanged.add(() => {
      if (this.debugLogging) {
        print(
          "Industrial Sketch: history undo=[" +
            this.doc.undoLabel +
            "] redo=[" +
            this.doc.redoLabel +
            "] items=" +
            this.doc.count
        )
      }
    })
    this.doc.onItemChanged.add((change) => {
      if (this.debugLogging && !this.doc.isEditing) {
        const it = change.item
        print(
          "Industrial Sketch: item " +
            change.id +
            " " +
            (it
              ? it.kind +
                " " +
                it.material +
                " color " +
                JSON.stringify(it.color) +
                " at " +
                JSON.stringify(it.transform.position)
              : "removed") +
            " (" +
            change.source +
            ")"
        )
      }
      if (change.source !== ChangeSource.Load) {
        this.autosaveDirty = true
        this.lastChangeTime = getTime()
      }
      if (!change.item) {
        const sel = this.state.selection
        if (sel.indexOf(change.id) >= 0) {
          this.state.selection = sel.filter((id) => id !== change.id)
        }
      }
    })

    this.workspace.resetView()
    this.palette.placeDefault()
    this.switchTool()
    bindPreviewShortcuts(this, this.state, this)

    if (this.restoreAutosave) {
      const file = this.storage.loadAutosave()
      if (file && file.items.length > 0) {
        this.doc.replaceAll(file.items)
        this.viewpoints = file.viewpoints ? file.viewpoints.slice(0, VIEWPOINT_COUNT) : []
        this.autosaveDirty = false
        this.hud.toast("Restored your last sketch (" + file.items.length + " items)", getTime())
      }
    }
    if (this.enableCollaboration) {
      this.collab = new CollabSession(this, this.doc, this.state)
      this.collab.onViewShared.add((shared) => (this.pendingView = shared))
    }
    this.started = true
    if (!this.storage.available) {
      this.hud.toast("Saving is unavailable on this device", getTime())
    }
  }

  private switchTool(): void {
    const next = this.tools.get(this.state.tool) ?? null
    if (next === this.activeTool) {
      return
    }
    if (this.activeTool) {
      this.activeTool.deactivate(this.ctx)
    }
    this.secondHandToTool = false
    this.activeTool = next
    if (next) {
      next.activate(this.ctx)
    }
  }

  private onUpdate(): void {
    if (!this.started) {
      return
    }
    try {
      this.frame()
    } catch (e) {
      const now = getTime()
      if (now - this.lastErrorTime > 2) {
        this.lastErrorTime = now
        print("Industrial Sketch: update error: " + e + (e && (e as Error).stack ? "\n" + (e as Error).stack : ""))
      }
      // Never leave gizmos half-built.
      try {
        this.gizmos.end()
      } catch {
        /* ignore */
      }
    }
  }

  private frame(): void {
    const time = getTime()
    this.ctx.dt = Math.min(getDeltaTime(), 0.1)
    this.ctx.time = time
    this.ctx.readout = ""
    this.hands.setDominant(this.state.dominantHand)
    // In the editor the mouse draws at the depth of the sketch.
    this.hands.mouseDepth = Math.max(
      25,
      this.camera.getWorldPosition().distance(this.workspace.rootToWorld(vec3.zero()))
    )
    this.hands.update()
    const dominant = this.hands.dominant
    const off = this.hands.nonDominant

    if (this.debugLogging && (dominant.pinchDown || dominant.pinchUp || off.pinchDown || off.pinchUp)) {
      print(
        "Industrial Sketch: " +
          (dominant.pinchDown ? "dominant down " : dominant.pinchUp ? "dominant up " : "") +
          (off.pinchDown ? "off down " : off.pinchUp ? "off up " : "") +
          "| onUI=" +
          dominant.pinchOnUI +
          " simulated=" +
          dominant.simulated +
          " nav=" +
          this.navHand +
          " items=" +
          this.doc.count
      )
    }
    if (this.debugLogging && off.palmFacingCamera !== this.lastPalmFacing) {
      this.lastPalmFacing = off.palmFacingCamera
      print("Industrial Sketch: non-dominant palm facing user: " + off.palmFacingCamera)
    }
    // Apply a shared view only between gestures, so it never cuts into a grab, edit or navigation.
    if (this.pendingView && !this.doc.isEditing && !this.navHand && !dominant.pinching) {
      this.workspace.applyViewpoint(this.pendingView.viewpoint)
      this.state.toast("Now looking from " + this.pendingView.from + "'s view")
      this.pendingView = null
    }
    this.gizmos.begin()
    this.routeNavigation(dominant, off)
    const presenting = this.state.presentation
    const toolActive = dominant.tracked && !dominant.pinchOnUI && !this.dominantInNav && !presenting
    if (this.activeTool && !presenting) {
      this.activeTool.update(this.ctx, dominant, toolActive)
    }
    if (this.secondHandToTool && this.activeTool?.updateSecondHand) {
      this.activeTool.updateSecondHand(this.ctx, off)
      if (!off.pinching) {
        this.secondHandToTool = false
      }
    }
    if (!presenting) {
      this.drawRemoteCursors()
      this.drawSymmetryGuides()
      this.drawNavigationFeedback(dominant, off)
    }
    this.gizmos.end()

    this.workspace.update(this.ctx.dt)
    this.palette.update(off)
    const readoutAt = this.ctx.readout ? dominant.position : null
    let hint = presenting
      ? "Presentation — open Scene › Present to exit"
      : this.activeTool
        ? this.activeTool.hint(this.ctx)
        : ""
    if (this.workspace.isNavigating) {
      hint = this.workspace.isTwoHandNavigating
        ? "Scale " + Math.round(this.workspace.scale * 100) + "%"
        : "Moving the sketch"
    }
    this.hud.update(time, hint, this.ctx.readout, readoutAt, (layer) => !this.state.isLayerVisible(layer))
    if (this.collab) {
      this.collab.update(
        time,
        dominant.tracked ? {position: this.workspace.worldToRoot(dominant.position), drawing: dominant.pinching} : null
      )
    }

    if (this.autosaveDirty && time - this.lastChangeTime > AUTOSAVE_DELAY && !this.doc.isEditing) {
      this.autosaveDirty = false
      const err = this.storage.autosave(this.doc.all(), this.workspace.scale, this.viewpoints)
      if (err) {
        print("Industrial Sketch: autosave failed: " + err)
      }
    }
  }

  /**
   * Hand routing between world navigation and tools:
   * - Non-dominant pinch in empty space → move/turn the sketch (unless the tool asked for the second hand).
   * - Dominant pinch while navigating → two-hand navigation (adds scaling).
   */
  private routeNavigation(dominant: HandState, off: HandState): void {
    const toolWantsSecond = !!this.activeTool?.wantsSecondHand && this.activeTool.wantsSecondHand(this.ctx)
    if (off.pinchDown && !off.pinchOnUI) {
      if (toolWantsSecond) {
        this.secondHandToTool = true
      } else if (!(dominant.pinching && !dominant.pinchOnUI)) {
        this.navHand = "nondominant"
        this.dominantInNav = false
        this.workspace.beginNavigation(off.position, off.rotation.multiplyVec3(vec3.forward()))
      }
    }
    if (this.navHand && dominant.pinchDown && !dominant.pinchOnUI && !this.dominantInNav) {
      this.dominantInNav = true
      this.workspace.beginTwoHandNavigation(off.position, dominant.position)
    }
    if (this.navHand) {
      if (!off.pinching || !off.tracked) {
        this.workspace.endNavigation()
        this.navHand = null
        if (this.debugLogging) {
          print("Industrial Sketch: navigation ended, scale " + this.workspace.scale.toFixed(3))
        }
      } else if (this.dominantInNav) {
        if (dominant.pinching && dominant.tracked) {
          this.workspace.updateNavigation(off.position, dominant.position, vec3.forward())
        } else {
          // Dominant released: continue one-handed from here.
          this.workspace.beginNavigation(off.position, off.rotation.multiplyVec3(vec3.forward()))
        }
      } else {
        this.workspace.updateNavigation(off.position, null, off.rotation.multiplyVec3(vec3.forward()))
      }
    }
    if (this.dominantInNav && !dominant.pinching) {
      this.dominantInNav = false
    }
  }

  private drawNavigationFeedback(dominant: HandState, off: HandState): void {
    if (!this.navHand) {
      return
    }
    this.gizmos.handle(off.position, 0.6, GizmoColors.accent)
    if (this.dominantInNav) {
      this.gizmos.line(off.position, dominant.position, 0.12, GizmoColors.accent)
      this.gizmos.handle(dominant.position, 0.6, GizmoColors.accent)
    }
  }

  private drawRemoteCursors(): void {
    if (!this.collab) {
      return
    }
    this.collab.cursors.forEach((c) => {
      const p = this.workspace.rootToWorld(c.position)
      this.gizmos.handle(p, c.drawing ? 0.6 : 0.45, c.color)
      this.gizmos.circle(p, this.camera.right, this.camera.up, 1.1, 0.08, GizmoColors.white, 16)
    })
  }

  private drawSymmetryGuides(): void {
    const mode = this.state.symmetry
    if (mode === SymmetryMode.Off) {
      return
    }
    const w = this.workspace
    const r = 18 / Math.max(w.scale, 1e-3)
    if (mode === SymmetryMode.Mirror) {
      const corners = [new vec3(0, 0, -r), new vec3(0, r * 1.4, -r), new vec3(0, r * 1.4, r), new vec3(0, 0, r)].map(
        (p) => w.rootToWorld(p)
      )
      this.gizmos.polyline(corners, 0.1, GizmoColors.symmetry, true)
      this.gizmos.line(
        w.rootToWorld(new vec3(0, r * 0.7, -r)),
        w.rootToWorld(new vec3(0, r * 0.7, r)),
        0.05,
        GizmoColors.symmetry
      )
    } else {
      this.gizmos.line(
        w.rootToWorld(new vec3(0, 0, 0)),
        w.rootToWorld(new vec3(0, r * 1.4, 0)),
        0.12,
        GizmoColors.symmetry
      )
      const n = this.state.radialCount
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2
        this.gizmos.line(
          w.rootToWorld(vec3.zero()),
          w.rootToWorld(new vec3(Math.sin(a) * r, 0, Math.cos(a) * r)),
          0.05,
          GizmoColors.symmetry
        )
      }
    }
  }

  // ---- PaletteHost ----

  /** History changes in the middle of a grab or edit would corrupt the open edit, so they wait for the pinch to end. */
  private blockedByGesture(): boolean {
    if (this.doc.isEditing) {
      this.state.toast("Finish the current gesture first")
      return true
    }
    return false
  }

  undo(): void {
    if (this.blockedByGesture()) return
    const label = this.doc.undo()
    this.state.toast(label ? "Undid " + label : "Nothing to undo")
  }

  redo(): void {
    if (this.blockedByGesture()) return
    const label = this.doc.redo()
    this.state.toast(label ? "Redid " + label : "Nothing to redo")
  }

  newSketch(): void {
    if (this.blockedByGesture()) return
    const ids = this.doc.all().map((i) => i.id)
    if (ids.length === 0) {
      this.state.toast("The sketch is already empty")
      return
    }
    this.doc.remove("Clear sketch", ids)
    // Saved views belong to the old sketch.
    this.viewpoints = []
    this.state.selection = []
    this.state.toast("Cleared — Undo brings it back")
  }

  saveSlot(slot: number): void {
    const items = this.doc.all()
    if (items.length === 0) {
      this.state.toast("Nothing to save yet")
      return
    }
    if (this.blockedByGesture()) return
    const err = this.storage.save(slot, "Sketch " + slot, items, this.workspace.scale, this.viewpoints)
    this.slotCache = null
    this.state.toast(err ? err : "Saved to slot " + slot + " (" + items.length + " items)")
  }

  loadSlot(slot: number): void {
    if (this.blockedByGesture()) return
    const file = this.storage.load(slot)
    if (!file) {
      this.state.toast("Slot " + slot + " is empty")
      return
    }
    // Opening is one undoable step: the current sketch is replaced, and Undo brings it back.
    const changes = new Map<string, SketchItem | null>()
    for (const item of this.doc.all()) {
      changes.set(item.id, null)
    }
    for (const item of file.items) {
      changes.set(item.id, item)
    }
    this.doc.commit("Open slot " + slot, changes)
    this.viewpoints = file.viewpoints ? file.viewpoints.slice(0, VIEWPOINT_COUNT) : []
    this.autosaveDirty = true
    this.state.selection = []
    this.frameAll()
    this.state.toast("Opened slot " + slot + " (" + file.items.length + " items)")
  }

  slotInfo(): SlotInfo[] {
    // Reading the slots parses every saved sketch: cache until a slot is written.
    if (!this.slotCache) {
      this.slotCache = this.storage.slots()
    }
    return this.slotCache
  }

  /** Visible items to export, or null (with a message) when there is nothing to export. */
  private exportItems(): SketchItem[] | null {
    const items = this.doc.all().filter((i) => this.state.isLayerVisible(i.layer))
    if (items.length === 0) {
      this.state.toast("Nothing to export")
      return null
    }
    return items
  }

  private exported(format: string, triangles: number): void {
    this.state.toast(
      triangles > 0 ? "Exported " + triangles + " triangles as " + format + " to the Logger" : "Nothing to export"
    )
  }

  exportObj(): void {
    const items = this.exportItems()
    if (!items) return
    const exp = exportObj(items)
    if (exp.triangleCount > 0) {
      printFiles([
        {name: "industrial_sketch.mtl", text: exp.mtl},
        {name: "industrial_sketch.obj", text: exp.obj}
      ])
    }
    this.exported("OBJ", exp.triangleCount)
  }

  exportGltf(): void {
    const items = this.exportItems()
    if (!items) return
    const exp = exportGltf(items)
    if (exp.triangleCount > 0) {
      printFiles([
        {name: "industrial_sketch.gltf", text: exp.gltf},
        {name: "industrial_sketch.bin.b64", text: exp.binBase64}
      ])
    }
    this.exported("glTF", exp.triangleCount)
  }

  exportStl(): void {
    const items = this.exportItems()
    if (!items) return
    const exp = exportStl(items)
    if (exp.triangleCount > 0) {
      printFiles([{name: "industrial_sketch.stl", text: exp.stl}])
    }
    this.exported("STL", exp.triangleCount)
  }

  saveView(slot: number): void {
    while (this.viewpoints.length < slot) {
      this.viewpoints.push(null)
    }
    this.viewpoints[slot - 1] = this.workspace.captureViewpoint()
    this.autosaveDirty = true
    this.lastChangeTime = getTime()
    this.state.toast("Saved view " + slot)
  }

  goToView(slot: number): void {
    const v = this.viewpoints[slot - 1]
    if (!v) {
      this.state.toast("View " + slot + " is empty — save it first")
      return
    }
    if (this.blockedByGesture()) return
    this.workspace.applyViewpoint(v)
    this.state.toast("View " + slot)
  }

  hasView(slot: number): boolean {
    return !!this.viewpoints[slot - 1]
  }

  shareView(): void {
    if (!this.collab || !this.collab.shareView(this.workspace.captureViewpoint())) {
      this.state.toast("Choose Multiplayer at start to share your view")
      return
    }
    this.state.toast("Everyone now sees your view")
  }

  insertReference(id: string): void {
    const model = REFERENCE_MODELS.find((m) => m.id === id)
    if (!model) return
    if (this.blockedByGesture()) return
    // Stand the model on the floor plane (y = 0 of the sketch), under the point the user is looking at.
    const ahead = this.workspace.worldToRoot(this.camera.getWorldPosition().add(this.camera.back.uniformScale(70)))
    const items = referenceItems(model, {x: ahead.x, y: 0, z: ahead.z}, this.state.activeLayer)
    const changes = new Map<string, SketchItem | null>()
    for (const item of items) {
      changes.set(item.id, item)
    }
    this.doc.commit("Insert " + model.label.toLowerCase(), changes)
    this.state.selection = items.map((i) => i.id)
    this.state.toast(model.label + " added at real size — Grab moves it, Frame all shows it")
  }

  typeNote(): void {
    this.state.tool = ToolId.Note
    try {
      // Re-requesting while open restarts the session cleanly.
      global.textInputSystem.dismissKeyboard()
      let typed = false
      const options = new TextInputSystem.KeyboardOptions()
      options.enablePreview = true
      options.keyboardType = TextInputSystem.KeyboardType.Text
      options.returnKeyType = TextInputSystem.ReturnKeyType.Done
      options.initialText = ""
      options.onTextChanged = (text: string) => {
        typed = true
        this.state.noteText = text
      }
      options.onReturnKeyPressed = () => {
        global.textInputSystem.dismissKeyboard()
      }
      options.onKeyboardStateChanged = (open: boolean) => {
        if (open || !typed) {
          return
        }
        this.state.toast(
          this.state.noteText.trim().length > 0
            ? 'Pinch to pin "' + this.state.noteText + '"'
            : "Empty note — type something or pick a preset"
        )
      }
      options.onError = (_code: number, description: string) => {
        this.state.toast("Keyboard unavailable: " + description)
      }
      global.textInputSystem.requestKeyboard(options)
    } catch (e) {
      this.state.toast("Keyboard unavailable here — pick a preset note")
      if (this.debugLogging) {
        print("Industrial Sketch: keyboard request failed: " + e)
      }
    }
  }

  resetView(): void {
    this.workspace.resetView()
    this.palette.placeDefault()
  }

  frameAll(): void {
    const items = this.doc.all().filter((i) => this.state.isLayerVisible(i.layer))
    if (items.length === 0) {
      this.workspace.resetView()
      return
    }
    let min = new vec3(Infinity, Infinity, Infinity)
    let max = new vec3(-Infinity, -Infinity, -Infinity)
    for (const item of items) {
      const b = this.views.getBounds(item.id)
      if (!b) continue
      for (const corner of boxCorners(b.min, b.max)) {
        const p = itemToRoot(item.transform, corner)
        min = new vec3(Math.min(min.x, p.x), Math.min(min.y, p.y), Math.min(min.z, p.z))
        max = new vec3(Math.max(max.x, p.x), Math.max(max.y, p.y), Math.max(max.z, p.z))
      }
    }
    if (min.x > max.x) {
      this.workspace.resetView()
      return
    }
    this.workspace.frameBounds(min, max)
  }

  lifeSize(): void {
    this.workspace.setScale(1)
    this.state.toast("Life size (1:1)")
  }

  get eyedropper(): boolean {
    return this.paintTool ? this.paintTool.eyedropper : false
  }

  set eyedropper(v: boolean) {
    if (this.paintTool) {
      this.paintTool.eyedropper = v
    }
  }

  collabStatus(): string {
    return this.collab ? this.collab.statusLabel() : "Collaboration off"
  }

  toggleCollab(): void {
    if (!this.collab) {
      this.state.toast("Collaboration is disabled on this lens")
      return
    }
    this.collab.toggle()
  }
}

function boxCorners(min: {x: number; y: number; z: number}, max: {x: number; y: number; z: number}) {
  const out: {x: number; y: number; z: number}[] = []
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        out.push({x, y, z})
      }
    }
  }
  return out
}
