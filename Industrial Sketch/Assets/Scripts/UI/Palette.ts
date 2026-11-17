/**
 * SPECS Inc. 2027
 * The tool palette: a UI Kit frame with six pages (Tools, Options, Color, Scene, Review, File).
 *
 * By default it floats where you leave it (drag it by its border). With "Palette on hand" on, it docks next to
 * the non-dominant hand whenever that palm faces you — the classic off-hand tool palette of VR design tools.
 */
import {Frame} from "UIKit.lspkg/Scripts/Components/Frame/Frame"
import {
  AppState,
  LAYER_COUNT,
  NOTE_PRESETS,
  PALETTE,
  SettingKey,
  SURFACE_MODES,
  surfaceLabel,
  TOOL_ORDER,
  ToolId,
  toolLabel
} from "../Core/AppState"
import {hsvToRgb, rgbToHsv} from "../Core/LensMath"
import {SketchDocument} from "../Core/SketchDocument"
import {MATERIAL_PRESETS, materialLabel} from "../Core/SketchTypes"
import {PRIMITIVE_KINDS, primitiveLabel} from "../Geometry/Primitives"
import {CAGE_KINDS, cageLabel} from "../Geometry/SubD"
import {SymmetryMode} from "../Geometry/Symmetry"
import {CROSS_SECTIONS, crossSectionLabel} from "../Geometry/TubeBuilder"
import {HandState} from "../Input/HandTracker"
import {SlotInfo} from "../Persistence/SketchStorage"
import {MaterialLibrary} from "../Render/MaterialLibrary"
import {SelectionActions} from "../Tools/SelectionActions"
import {REFERENCE_MODELS} from "../Workspace/ReferenceLibrary"
import {
  createButton,
  createChild,
  createLabel,
  createSlider,
  createSwatch,
  UI_RENDER_ORDER,
  UiButton,
  UiSlider,
  UiSwatch
} from "./UiFactory"

/** Operations the palette triggers on the app. */
export interface PaletteHost {
  undo(): void
  redo(): void
  newSketch(): void
  saveSlot(slot: number): void
  loadSlot(slot: number): void
  slotInfo(): SlotInfo[]
  exportObj(): void
  exportGltf(): void
  exportStl(): void
  /** Saves / restores viewpoint `slot` (1-based). */
  saveView(slot: number): void
  goToView(slot: number): void
  hasView(slot: number): boolean
  /** Brings every collaborator to the local viewpoint. */
  shareView(): void
  insertReference(id: string): void
  /** Opens the system keyboard to type the next note. */
  typeNote(): void
  resetView(): void
  frameAll(): void
  lifeSize(): void
  readonly actions: SelectionActions
  eyedropper: boolean
  collabStatus(): string
  toggleCollab(): void
}

enum Page {
  Tools = "Tools",
  Options = "Options",
  Color = "Color",
  Scene = "Scene",
  Review = "Review",
  File = "File",
  Learn = "Learn"
}

const PAGES: Page[] = [Page.Tools, Page.Options, Page.Color, Page.Scene, Page.Review, Page.File, Page.Learn]
export const VIEWPOINT_COUNT = 3

const WIDTH = 34
const HEIGHT = 31
/** The frame is authored in cm and shown at this scale so it fits comfortably in the field of view. */
const PALETTE_SCALE = 0.65
/** Content sits in front of the frame's backplate so button visuals never z-fight with it. */
const CONTENT_Z = 0.5
const ROW = 3.3
const GRID_STEPS = [1, 2, 5, 10]
const WIDTH_MIN = 0.1
const WIDTH_MAX = 6
const SOFT_MAX = 30

interface Binding {
  refresh(): void
}

export class Palette {
  readonly root: SceneObject
  private frame: Frame
  private content: SceneObject | null = null
  private page: Page = Page.Tools
  private pageRoots = new Map<Page, SceneObject>()
  private tabs = new Map<Page, UiButton>()
  private bindings: Binding[] = []
  private optionGroups: {tools: ToolId[]; root: SceneObject}[] = []
  private status: Text | null = null
  private built = false
  private docked = false
  private dirty = true
  private lastTimedRefresh = 0

  /** Dock to the non-dominant hand when its palm faces the user. */
  followHand = false

  constructor(
    private readonly state: AppState,
    private readonly doc: SketchDocument,
    private readonly materials: MaterialLibrary,
    private readonly host: PaletteHost,
    private readonly camera: Transform
  ) {
    this.root = global.scene.createSceneObject("Tool Palette")
    this.frame = this.root.createComponent(Frame.getTypeName()) as Frame
    this.frame.autoShowHide = false
    this.frame.allowTranslation = true
    this.frame.innerSize = new vec2(WIDTH, HEIGHT)
    this.root.getTransform().setLocalScale(new vec3(PALETTE_SCALE, PALETTE_SCALE, PALETTE_SCALE))
    this.frame.onInitialized.add(() => this.build())
    state.onChanged.add((key) => this.onSetting(key))
    doc.onHistoryChanged.add(() => (this.dirty = true))
    doc.onItemChanged.add(() => (this.dirty = true))
  }

  /** Places the palette to the left of the user's view. */
  placeDefault(): void {
    const head = this.camera.getWorldPosition()
    let forward = this.camera.back
    forward = new vec3(forward.x, 0, forward.z)
    forward = forward.length > 1e-3 ? forward.normalize() : new vec3(0, 0, -1)
    const right = forward.cross(vec3.up()).normalize()
    const side = this.state.dominantHand === "right" ? -1 : 1
    const pos = head
      .add(forward.uniformScale(60))
      .add(right.uniformScale(side * 32))
      .add(new vec3(0, -7, 0))
    const t = this.root.getTransform()
    t.setWorldPosition(pos)
    t.setWorldRotation(quat.lookAt(head.sub(pos).normalize(), vec3.up()))
  }

  set visible(v: boolean) {
    if (this.root.enabled !== v) {
      this.root.enabled = v
    }
  }

  get visible(): boolean {
    return this.root.enabled
  }

  /** Per-frame: hand docking and lazy refresh. */
  update(offHand: HandState): void {
    if (this.followHand && offHand.tracked && !offHand.simulated) {
      if (offHand.palmFacingCamera) {
        const head = this.camera.getWorldPosition()
        const toHead = head.sub(offHand.palmCenter).normalize()
        const right = toHead.cross(vec3.up()).normalize()
        // Sit beside the hand, towards the middle of the view, slightly raised.
        const side = offHand.side === "left" ? -1 : 1
        const target = offHand.palmCenter
          .add(right.uniformScale(side * ((WIDTH * PALETTE_SCALE) / 2 + 6)))
          .add(new vec3(0, 6, 0))
          .add(toHead.uniformScale(2))
        const t = this.root.getTransform()
        const current = t.getWorldPosition()
        const k = this.docked ? 0.35 : 1
        t.setWorldPosition(vec3.lerp(current, target, k))
        t.setWorldRotation(quat.slerp(t.getWorldRotation(), quat.lookAt(toHead, vec3.up()), this.docked ? 0.3 : 1))
        this.docked = true
        this.visible = true
      } else if (this.docked) {
        this.visible = false
        this.docked = false
      }
    } else if (this.docked) {
      this.docked = false
      this.visible = true
    }
    // Status that changes without app events (collaboration) refreshes once a second on the File page.
    const now = getTime()
    if (this.page === Page.File && now - this.lastTimedRefresh > 1) {
      this.lastTimedRefresh = now
      this.dirty = true
    }
    if (this.dirty && this.built) {
      this.dirty = false
      this.refresh()
    }
  }

  private onSetting(key: SettingKey): void {
    if (key === "tool") {
      this.showOptionGroup()
    }
    this.dirty = true
  }

  private build(): void {
    if (this.built) {
      return
    }
    this.built = true
    this.frame.renderOrder = UI_RENDER_ORDER - 1
    this.content = this.frame.content
    const top = HEIGHT / 2
    const title = createLabel(this.content, "INDUSTRIAL SKETCH", 14, 1.6, {align: HorizontalAlignment.Left, size: 36})
    title
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(-WIDTH / 2 + 7.5, top - 1.2, CONTENT_Z))
    this.status = createLabel(this.content, "", 18, 1.6, {
      align: HorizontalAlignment.Right,
      size: 32,
      color: new vec4(0.6, 0.85, 1, 1)
    })
    this.status
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(WIDTH / 2 - 9.5, top - 1.2, CONTENT_Z))

    const tabW = (WIDTH - 1) / PAGES.length
    PAGES.forEach((p, i) => {
      const b = createButton(
        this.content!,
        p,
        -WIDTH / 2 + 0.5 + tabW * (i + 0.5),
        top - 4,
        tabW - 0.4,
        2.6,
        () => this.showPage(p),
        true
      )
      b.root.getTransform().setLocalPosition(new vec3(-WIDTH / 2 + 0.5 + tabW * (i + 0.5), top - 4, CONTENT_Z))
      this.tabs.set(p, b)
      const pageRoot = createChild(this.content!, "Page " + p, 0, 0, CONTENT_Z)
      this.pageRoots.set(p, pageRoot)
    })
    this.buildToolsPage(this.pageRoots.get(Page.Tools)!)
    this.buildOptionsPage(this.pageRoots.get(Page.Options)!)
    this.buildColorPage(this.pageRoots.get(Page.Color)!)
    this.buildScenePage(this.pageRoots.get(Page.Scene)!)
    this.buildReviewPage(this.pageRoots.get(Page.Review)!)
    this.buildFilePage(this.pageRoots.get(Page.File)!)
    this.buildLearnPage(this.pageRoots.get(Page.Learn)!)
    // Open on Learn: the first thing a new user sees is what everything does.
    this.showPage(Page.Learn)
    this.showOptionGroup()
    this.refresh()
  }

  private showPage(p: Page): void {
    this.page = p
    this.pageRoots.forEach((root, key) => (root.enabled = key === p))
    this.tabs.forEach((b, key) => b.setOn(key === p))
    this.dirty = true
  }

  /** Grid position helper: column c (0..2), row r (0 = first row under the tabs). */
  private cell(c: number, r: number, cols: number = 3): {x: number; y: number; w: number} {
    const w = (WIDTH - 1) / cols
    return {x: -WIDTH / 2 + 0.5 + w * (c + 0.5), y: HEIGHT / 2 - 7.6 - r * ROW, w: w - 0.4}
  }

  private button(
    parent: SceneObject,
    label: string,
    c: number,
    r: number,
    cols: number,
    onTap: () => void,
    isOn?: () => boolean,
    inactive?: () => boolean
  ): UiButton {
    const p = this.cell(c, r, cols)
    const b = createButton(
      parent,
      label,
      p.x,
      p.y,
      p.w,
      ROW - 0.5,
      () => {
        onTap()
        this.dirty = true
      },
      !!isOn
    )
    if (isOn || inactive) {
      this.bindings.push({
        refresh: () => {
          if (isOn) b.setOn(isOn())
          if (inactive) b.setInactive(inactive())
        }
      })
    }
    return b
  }

  private slider(
    parent: SceneObject,
    r: number,
    label: () => string,
    get: () => number,
    set: (v: number) => void
  ): UiSlider {
    const p = this.cell(0, r, 1)
    const s = createSlider(parent, label(), p.x, p.y, p.w, get(), (v) => {
      set(v)
      s.setLabel(label())
    })
    this.bindings.push({
      refresh: () => {
        s.setValue(get())
        s.setLabel(label())
      }
    })
    return s
  }

  private buildToolsPage(root: SceneObject): void {
    TOOL_ORDER.forEach((tool, i) => {
      this.button(
        root,
        toolLabel(tool),
        i % 3,
        Math.floor(i / 3),
        3,
        () => (this.state.tool = tool),
        () => this.state.tool === tool
      )
    })
    const r = Math.ceil(TOOL_ORDER.length / 3)
    const undo = this.button(
      root,
      "Undo",
      0,
      r + 0.25,
      2,
      () => this.host.undo(),
      undefined,
      () => !this.doc.canUndo
    )
    const redo = this.button(
      root,
      "Redo",
      1,
      r + 0.25,
      2,
      () => this.host.redo(),
      undefined,
      () => !this.doc.canRedo
    )
    this.bindings.push({
      refresh: () => {
        undo.setLabel(this.doc.canUndo ? "Undo " + this.doc.undoLabel : "Undo")
        redo.setLabel(this.doc.canRedo ? "Redo " + this.doc.redoLabel : "Redo")
      }
    })
    this.button(
      root,
      "Snap",
      0,
      r + 1.25,
      3,
      () => (this.state.snap = !this.state.snap),
      () => this.state.snap
    )
    this.button(
      root,
      "Planar",
      1,
      r + 1.25,
      3,
      () => (this.state.planar = !this.state.planar),
      () => this.state.planar
    )
    this.button(
      root,
      "Mirror",
      2,
      r + 1.25,
      3,
      () => {
        this.state.symmetry = this.state.symmetry === SymmetryMode.Mirror ? SymmetryMode.Off : SymmetryMode.Mirror
      },
      () => this.state.symmetry === SymmetryMode.Mirror
    )
  }

  private optionGroup(parent: SceneObject, tools: ToolId[]): SceneObject {
    const root = createChild(parent, "Options " + tools.join(","), 0, 0, 0)
    this.optionGroups.push({tools, root})
    return root
  }

  private showOptionGroup(): void {
    for (const g of this.optionGroups) {
      g.root.enabled = g.tools.indexOf(this.state.tool) >= 0
    }
  }

  private buildOptionsPage(root: SceneObject): void {
    // Stroke.
    const stroke = this.optionGroup(root, [ToolId.Stroke])
    CROSS_SECTIONS.forEach((s, i) =>
      this.button(
        stroke,
        crossSectionLabel(s),
        i % 3,
        Math.floor(i / 3),
        3,
        () => (this.state.section = s),
        () => this.state.section === s
      )
    )
    this.button(
      stroke,
      "Taper ends",
      2,
      1,
      3,
      () => (this.state.taper = !this.state.taper),
      () => this.state.taper
    )
    this.brushSliders(stroke, 2.2)

    // Surface.
    const surface = this.optionGroup(root, [ToolId.Surface])
    SURFACE_MODES.forEach((m, i) =>
      this.button(
        surface,
        surfaceLabel(m),
        i % 2,
        Math.floor(i / 2),
        2,
        () => (this.state.surfaceMode = m),
        () => this.state.surfaceMode === m
      )
    )
    this.brushSliders(surface, 2.2)

    // Shapes.
    const prim = this.optionGroup(root, [ToolId.Primitive])
    PRIMITIVE_KINDS.forEach((k, i) =>
      this.button(
        prim,
        primitiveLabel(k),
        i % 3,
        Math.floor(i / 3),
        3,
        () => (this.state.primitive = k),
        () => this.state.primitive === k
      )
    )

    // SubD.
    const subd = this.optionGroup(root, [ToolId.SubD])
    CAGE_KINDS.forEach((k, i) =>
      this.button(
        subd,
        cageLabel(k),
        i % 2,
        Math.floor(i / 2),
        2,
        () => (this.state.cage = k),
        () => this.state.cage === k
      )
    )
    createLabel(
      subd,
      "Use Edit to drag cage points and faces; turn on Extrude to pull out new faces.",
      WIDTH - 2,
      2.4,
      {size: 30}
    )
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, this.cell(0, 2.4).y, 0.35))

    // Edit.
    const edit = this.optionGroup(root, [ToolId.Edit])
    this.button(
      edit,
      "Extrude faces",
      0,
      0,
      2,
      () => (this.state.extrude = !this.state.extrude),
      () => this.state.extrude
    )
    this.slider(
      edit,
      1.2,
      () => "Falloff " + this.state.softRadius.toFixed(0) + " cm",
      () => this.state.softRadius / SOFT_MAX,
      (v) => (this.state.softRadius = Math.max(0.5, v * SOFT_MAX))
    )

    // Grab (selection actions).
    const grab = this.optionGroup(root, [ToolId.Select])
    const a = this.host.actions
    const noSelection = () => this.state.selection.length === 0
    this.button(grab, "Duplicate", 0, 0, 3, () => a.duplicate(), undefined, noSelection)
    this.button(grab, "Mirror copy", 1, 0, 3, () => a.mirrorCopy(), undefined, noSelection)
    this.button(grab, "Delete", 2, 0, 3, () => a.delete(), undefined, noSelection)
    this.button(grab, "Group", 0, 1, 3, () => a.group(), undefined, noSelection)
    this.button(grab, "Ungroup", 1, 1, 3, () => a.ungroup(), undefined, noSelection)
    this.button(grab, "Straighten", 2, 1, 3, () => a.straighten(), undefined, noSelection)
    this.button(grab, "Center on axis", 0, 2, 3, () => a.centerOnAxis(), undefined, noSelection)
    this.button(grab, "To active layer", 1, 2, 3, () => a.moveToActiveLayer(), undefined, noSelection)
    this.button(grab, "Apply color", 2, 2, 3, () => a.applyMaterial(), undefined, noSelection)
    this.button(grab, "Select all", 0, 3, 2, () => a.selectAll())
    this.button(grab, "Clear selection", 1, 3, 2, () => a.clearSelection(), undefined, noSelection)

    // Paint.
    const paint = this.optionGroup(root, [ToolId.Paint])
    this.button(
      paint,
      "Eyedropper",
      0,
      0,
      2,
      () => (this.host.eyedropper = !this.host.eyedropper),
      () => this.host.eyedropper
    )
    this.button(paint, "Paint selection", 1, 0, 2, () => a.applyMaterial(), undefined, noSelection)

    // Notes.
    const note = this.optionGroup(root, [ToolId.Note])
    NOTE_PRESETS.forEach((text, i) =>
      this.button(
        note,
        text,
        i % 3,
        Math.floor(i / 3),
        3,
        () => (this.state.noteText = text),
        () => this.state.noteText === text
      )
    )
    const typed = this.button(note, "Type a note…", 0, 3.2, 1, () => this.host.typeNote())
    this.bindings.push({
      refresh: () =>
        typed.setLabel(
          NOTE_PRESETS.indexOf(this.state.noteText) < 0 && this.state.noteText.length > 0
            ? "Typed: " + truncate(this.state.noteText, 28)
            : "Type a note…"
        )
    })

    // Erase / Measure.
    const erase = this.optionGroup(root, [ToolId.Erase])
    this.button(erase, "Delete selection", 0, 0, 2, () => a.delete(), undefined, noSelection)
    this.button(erase, "Clear sketch", 1, 0, 2, () => this.host.newSketch())
    const measure = this.optionGroup(root, [ToolId.Measure])
    this.button(
      measure,
      "Snap to grid",
      0,
      0,
      2,
      () => (this.state.snap = !this.state.snap),
      () => this.state.snap
    )
    GRID_STEPS.forEach((g, i) =>
      this.button(
        measure,
        "Grid " + g + " cm",
        i,
        1,
        4,
        () => (this.state.gridStep = g),
        () => this.state.gridStep === g
      )
    )
  }

  private brushSliders(parent: SceneObject, row: number): void {
    this.slider(
      parent,
      row,
      () => "Size " + this.state.width.toFixed(1) + " cm",
      () => Math.sqrt((this.state.width - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN)),
      (v) => (this.state.width = WIDTH_MIN + v * v * (WIDTH_MAX - WIDTH_MIN))
    )
    this.slider(
      parent,
      row + 1,
      () => "Smoothing " + Math.round(this.state.smoothing * 100) + "%",
      () => this.state.smoothing,
      (v) => (this.state.smoothing = v)
    )
  }

  private buildColorPage(root: SceneObject): void {
    const swatches: {swatch: UiSwatch; color: [number, number, number]}[] = []
    const cols = 6
    const d = 3.6
    PALETTE.forEach((color, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      const x = -WIDTH / 2 + 2.6 + c * (d + 0.9)
      const y = HEIGHT / 2 - 8 - r * (d + 0.8)
      const sw = createSwatch(root, x, y, d, this.materials.get(color, this.state.material), () => {
        this.state.color = color
        this.dirty = true
      })
      swatches.push({swatch: sw, color})
    })
    this.bindings.push({
      refresh: () => {
        const cur = this.state.color
        for (const s of swatches) {
          s.swatch.ball.setMaterial(this.materials.get(s.color, this.state.material))
          s.swatch.setOn(s.color[0] === cur[0] && s.color[1] === cur[1] && s.color[2] === cur[2])
        }
      }
    })
    // Current color preview.
    const preview = createSwatch(
      root,
      WIDTH / 2 - 3.2,
      HEIGHT / 2 - 10.2,
      4.6,
      this.materials.get(this.state.color, this.state.material),
      () => {}
    )
    this.bindings.push({
      refresh: () => preview.ball.setMaterial(this.materials.get(this.state.color, this.state.material))
    })

    MATERIAL_PRESETS.forEach((m, i) =>
      this.button(
        root,
        materialLabel(m),
        i % 3,
        2.5 + Math.floor(i / 3),
        3,
        () => (this.state.material = m),
        () => this.state.material === m
      )
    )
    const hsv = () => rgbToHsv(this.state.color)
    const setHsv = (h: number, s: number, v: number) => (this.state.color = hsvToRgb(h, s, v))
    this.slider(
      root,
      4.6,
      () => "Hue",
      () => hsv()[0],
      (v) => {
        const c = hsv()
        // Dragging the hue of a gray adds enough saturation for the hue to show.
        setHsv(Math.min(v, 0.999), c[1] < 0.15 ? 0.7 : c[1], Math.max(c[2], 0.2))
      }
    )
    this.slider(
      root,
      5.6,
      () => "Saturation",
      () => hsv()[1],
      (v) => {
        const c = hsv()
        setHsv(c[0], v, Math.max(c[2], 0.05))
      }
    )
    this.slider(
      root,
      6.6,
      () => "Brightness",
      () => hsv()[2],
      (v) => {
        const c = hsv()
        setHsv(c[0], c[1], Math.max(v, 0.02))
      }
    )
  }

  private buildScenePage(root: SceneObject): void {
    const s = this.state
    this.button(
      root,
      "Symmetry off",
      0,
      0,
      3,
      () => (s.symmetry = SymmetryMode.Off),
      () => s.symmetry === SymmetryMode.Off
    )
    this.button(
      root,
      "Mirror X",
      1,
      0,
      3,
      () => (s.symmetry = SymmetryMode.Mirror),
      () => s.symmetry === SymmetryMode.Mirror
    )
    const radial = this.button(
      root,
      "Radial",
      2,
      0,
      3,
      () => {
        s.symmetry = SymmetryMode.Radial
      },
      () => s.symmetry === SymmetryMode.Radial
    )
    this.bindings.push({refresh: () => radial.setLabel("Radial ×" + s.radialCount)})
    this.button(
      root,
      "Fewer copies",
      0,
      1,
      2,
      () => (s.radialCount = s.radialCount - 1),
      undefined,
      () => s.radialCount <= 2
    )
    this.button(
      root,
      "More copies",
      1,
      1,
      2,
      () => (s.radialCount = s.radialCount + 1),
      undefined,
      () => s.radialCount >= 16
    )

    this.button(
      root,
      "Grid",
      0,
      2,
      3,
      () => (s.showGrid = !s.showGrid),
      () => s.showGrid
    )
    this.button(
      root,
      "Mannequin",
      1,
      2,
      3,
      () => (s.showMannequin = !s.showMannequin),
      () => s.showMannequin
    )
    this.button(
      root,
      "Present",
      2,
      2,
      3,
      () => (s.presentation = !s.presentation),
      () => s.presentation
    )

    this.button(root, "Reset view", 0, 3, 3, () => this.host.resetView())
    this.button(root, "Frame all", 1, 3, 3, () => this.host.frameAll())
    this.button(root, "Life size 1:1", 2, 3, 3, () => this.host.lifeSize())

    for (let l = 0; l < LAYER_COUNT; l++) {
      const layer = l
      const b = this.button(
        root,
        "Layer " + (l + 1),
        l,
        4,
        LAYER_COUNT,
        () => (s.activeLayer = layer),
        () => s.activeLayer === layer
      )
      this.bindings.push({refresh: () => b.setLabel((s.activeLayer === layer ? "● " : "") + "Layer " + (layer + 1))})
    }
    for (let l = 0; l < LAYER_COUNT; l++) {
      const layer = l
      const b = this.button(
        root,
        "Show",
        l,
        5,
        LAYER_COUNT,
        () => s.setLayerVisible(layer, !s.isLayerVisible(layer)),
        () => s.isLayerVisible(layer),
        () => s.activeLayer === layer
      )
      this.bindings.push({refresh: () => b.setLabel(s.isLayerVisible(layer) ? "Visible" : "Hidden")})
    }
    this.button(
      root,
      "Left-handed",
      0,
      6,
      2,
      () => (s.dominantHand = s.dominantHand === "right" ? "left" : "right"),
      () => s.dominantHand === "left"
    )
    this.button(
      root,
      "Palette on hand",
      1,
      6,
      2,
      () => (this.followHand = !this.followHand),
      () => this.followHand
    )
  }

  private buildReviewPage(root: SceneObject): void {
    const heading = (text: string, r: number) =>
      createLabel(root, text, WIDTH - 2, 1.8, {
        size: 32,
        align: HorizontalAlignment.Left,
        color: new vec4(0.6, 0.85, 1, 1)
      })
        .getSceneObject()
        .getTransform()
        .setLocalPosition(new vec3(0, this.cell(0, r).y, 0.35))
    heading("Viewpoints", -0.15)
    for (let i = 0; i < VIEWPOINT_COUNT; i++) {
      const slot = i + 1
      this.button(root, "Save view " + slot, 0, i + 0.55, 2, () => this.host.saveView(slot))
      this.button(
        root,
        "Go to view " + slot,
        1,
        i + 0.55,
        2,
        () => this.host.goToView(slot),
        undefined,
        () => !this.host.hasView(slot)
      )
    }
    this.button(root, "Bring everyone to my view", 0, 3.55, 1, () => this.host.shareView())
    heading("Reference models (real size)", 4.6)
    REFERENCE_MODELS.forEach((model, i) =>
      this.button(root, model.label, i % 3, 5.3 + Math.floor(i / 3), 3, () => this.host.insertReference(model.id))
    )
  }

  private buildFilePage(root: SceneObject): void {
    const slotButtons: {save: UiButton; open: UiButton}[] = []
    for (let i = 0; i < 4; i++) {
      const slot = i + 1
      const save = this.button(root, "Save " + slot, 0, i, 2, () => this.host.saveSlot(slot))
      const open = this.button(root, "Open " + slot, 1, i, 2, () => this.host.loadSlot(slot))
      slotButtons.push({save, open})
    }
    this.bindings.push({
      refresh: () => {
        if (this.page !== Page.File) {
          return
        }
        const info = this.host.slotInfo()
        info.forEach((slot, i) => {
          const b = slotButtons[i]
          if (!b) return
          b.save.setLabel("Save to slot " + slot.slot)
          b.open.setLabel(
            slot.used ? "Open " + slot.slot + " · " + slot.itemCount + " items" : "Slot " + slot.slot + " empty"
          )
          b.open.setInactive(!slot.used)
        })
      }
    })
    this.button(root, "New sketch", 0, 4.2, 2, () => this.host.newSketch())
    const collab = this.button(root, "Collaborate", 1, 4.2, 2, () => this.host.toggleCollab())
    this.bindings.push({refresh: () => collab.setLabel(this.host.collabStatus())})
    this.button(root, "Export OBJ", 0, 5.2, 3, () => this.host.exportObj())
    this.button(root, "Export glTF", 1, 5.2, 3, () => this.host.exportGltf())
    this.button(root, "Export STL", 2, 5.2, 3, () => this.host.exportStl())
    createLabel(
      root,
      "Autosaved and restored when you reopen the lens. Exports print to the Lens Studio Logger.",
      WIDTH - 2,
      2.2,
      {size: 30}
    )
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, this.cell(0, 6.3).y, 0.35))
  }

  /** Learn: one button per topic and a text area that explains it, so the whole lens can be learned in the lens. */
  private buildLearnPage(root: SceneObject): void {
    const body = createLabel(root, "", WIDTH - 2, 15.5, {size: 40, align: HorizontalAlignment.Left})
    body.horizontalOverflow = HorizontalOverflow.Wrap
    body.verticalOverflow = VerticalOverflow.Truncate
    body.verticalAlignment = VerticalAlignment.Top
    body.getSceneObject().getTransform().setLocalPosition(new vec3(0, this.cell(0, 2.2).y - 7.2, 0.35))
    let current = 0
    const show = (i: number) => {
      current = i
      body.text = LEARN_TOPICS[i].text
    }
    LEARN_TOPICS.forEach((topic, i) =>
      this.button(root, topic.title, i % 4, Math.floor(i / 4), 4, () => show(i), () => current === i)
    )
    show(0)
  }

  private refresh(): void {
    for (const b of this.bindings) {
      b.refresh()
    }
    if (this.status) {
      const n = this.doc.count
      this.status.text = toolLabel(this.state.tool) + " · " + n + (n === 1 ? " item" : " items")
    }
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

/** The Learn page: short explanations of everything in the lens, one topic per button. */
const LEARN_TOPICS: {title: string; text: string}[] = [
  {
    title: "Start",
    text:
      "Pinch with your dominant hand (right by default) to use the active tool. Pinch with the other hand in empty " +
      "space to move and turn the whole sketch; pinch with both hands to scale it. Pinch or poke the palette buttons, " +
      "and drag the palette by its border. Every change can be undone (Tools page)."
  },
  {
    title: "Draw",
    text:
      "Stroke draws freehand 3D curves; pick the cross-section (round, square, triangle, ribbon, thin line), size and " +
      "smoothing on the Options page. Surface sweeps a surface with your hand, revolves a profile, lofts between two " +
      "curves or fills a closed loop. Shapes drags out cubes, spheres, cylinders and more from their center; SubD " +
      "makes subdivision cages you sculpt by dragging vertices and faces, with extrusion."
  },
  {
    title: "Edit",
    text:
      "Grab: pinch to move and rotate, add the other hand to scale; tap to multi-select, then Duplicate, Mirror copy, " +
      "Delete, Group or Apply color from Options. Edit drags the control points of curves (neighbours follow with a " +
      "soft falloff). Paint sweeps color and finish onto objects; Erase sweeps to delete. Notes pins review comments."
  },
  {
    title: "Precision",
    text:
      "Snap (Tools page) locks points to a 1, 2, 5 or 10 cm grid, rotations to 15 degrees and strokes to straight " +
      "lines. Planar draws on the plane of your other palm, for flat curves without depth wobble. Mirror and radial " +
      "symmetry (Scene page) repeat your work live. Measure draws dimension lines in mm, cm or m."
  },
  {
    title: "Color",
    text:
      "Pick one of 12 swatches, fine-tune with the hue, saturation and value sliders, and choose a finish: Matte, " +
      "Satin, Gloss, Metal, Chrome or Flat. New strokes and shapes use the current color; Paint applies it to " +
      "existing objects and the eyedropper picks a color from one."
  },
  {
    title: "Scene",
    text:
      "Toggle the construction grid and the 175 cm mannequin for scale, put work on four layers, and use Reset view, " +
      "Frame all or Life size 1:1. Present hides the tools and turns the sketch on a turntable for reviews. " +
      "Left-handed mode swaps the hands; the palette can also dock next to your non-dominant palm."
  },
  {
    title: "Review",
    text:
      "Save up to three viewpoints and jump back to them. In a shared session, Bring everyone to my view moves every " +
      "collaborator to your viewpoint. Insert real-size reference models (chair, table, phone, mug, bottle, car) to " +
      "check proportions; they are editable groups."
  },
  {
    title: "Files & share",
    text:
      "Save and open four slots on the device; the sketch also autosaves and comes back next time. Export OBJ, glTF " +
      "or STL (printed to the Lens Studio Logger). Choose Multiplayer on the start menu to sketch together: changes, " +
      "notes and cursors are shared live and late joiners get the current sketch."
  }
]
