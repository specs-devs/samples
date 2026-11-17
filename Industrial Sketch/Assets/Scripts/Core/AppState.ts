/**
 * SPECS Inc. 2027
 * User-facing settings of the Industrial Sketch lens: active tool, brush, color, symmetry, snapping, layers.
 */
import {PrimitiveKind} from "../Geometry/Primitives"
import {CageKind} from "../Geometry/SubD"
import {SymmetryMode} from "../Geometry/Symmetry"
import {CrossSection} from "../Geometry/TubeBuilder"
import {Signal} from "./Signal"
import {MaterialPreset, NOTE_MAX_LENGTH} from "./SketchTypes"

export enum ToolId {
  Stroke = "stroke",
  Surface = "surface",
  Primitive = "primitive",
  SubD = "subd",
  Select = "select",
  Edit = "edit",
  Paint = "paint",
  Erase = "erase",
  Measure = "measure",
  Note = "note"
}

export const TOOL_ORDER: ToolId[] = [
  ToolId.Stroke,
  ToolId.Surface,
  ToolId.Primitive,
  ToolId.SubD,
  ToolId.Select,
  ToolId.Edit,
  ToolId.Paint,
  ToolId.Erase,
  ToolId.Measure,
  ToolId.Note
]

export function toolLabel(tool: ToolId): string {
  switch (tool) {
    case ToolId.Stroke:
      return "Stroke"
    case ToolId.Surface:
      return "Surface"
    case ToolId.Primitive:
      return "Shapes"
    case ToolId.SubD:
      return "SubD"
    case ToolId.Select:
      return "Grab"
    case ToolId.Edit:
      return "Edit"
    case ToolId.Paint:
      return "Paint"
    case ToolId.Erase:
      return "Erase"
    case ToolId.Measure:
      return "Measure"
    case ToolId.Note:
      return "Notes"
  }
}

export enum SurfaceMode {
  Sweep = "sweep",
  Revolve = "revolve",
  Loft = "loft",
  Fill = "fill"
}

export const SURFACE_MODES: SurfaceMode[] = [SurfaceMode.Sweep, SurfaceMode.Revolve, SurfaceMode.Loft, SurfaceMode.Fill]

export function surfaceLabel(mode: SurfaceMode): string {
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

export const LAYER_COUNT = 4

/** One-tap review comments for the Notes tool (typing needs the system keyboard). */
export const NOTE_PRESETS: string[] = [
  "Check this",
  "Fix",
  "Approved",
  "Thicker",
  "Thinner",
  "Smoother",
  "Too big",
  "Too small",
  "Align here"
]

/** Curated palette for industrial design work (linear-ish RGB). */
export const PALETTE: [number, number, number][] = [
  [0.95, 0.95, 0.95],
  [0.55, 0.57, 0.6],
  [0.16, 0.17, 0.19],
  [0.93, 0.26, 0.21],
  [0.98, 0.55, 0.12],
  [0.98, 0.83, 0.2],
  [0.4, 0.78, 0.32],
  [0.12, 0.7, 0.67],
  [0.18, 0.5, 0.95],
  [0.45, 0.32, 0.9],
  [0.86, 0.33, 0.69],
  [0.6, 0.42, 0.28]
]

export type SettingKey =
  | "tool"
  | "section"
  | "width"
  | "smoothing"
  | "taper"
  | "planar"
  | "color"
  | "material"
  | "surfaceMode"
  | "primitive"
  | "cage"
  | "symmetry"
  | "radialCount"
  | "snap"
  | "gridStep"
  | "layers"
  | "dominantHand"
  | "showGrid"
  | "showMannequin"
  | "presentation"
  | "softRadius"
  | "extrude"
  | "selection"
  | "noteText"

/** Observable app settings. Setting a value emits `onChanged` with its key. */
export class AppState {
  readonly onChanged = new Signal<SettingKey>()
  /** Short messages for the HUD (e.g. "Saved"). */
  readonly onToast = new Signal<string>()

  private _tool: ToolId = ToolId.Stroke
  private _section: CrossSection = CrossSection.Round
  private _width = 0.8
  private _smoothing = 0.5
  private _taper = false
  private _planar = false
  private _color: [number, number, number] = PALETTE[8]
  private _material: MaterialPreset = MaterialPreset.Satin
  private _surfaceMode: SurfaceMode = SurfaceMode.Sweep
  private _primitive: PrimitiveKind = PrimitiveKind.Cube
  private _cage: CageKind = CageKind.Box
  private _symmetry: SymmetryMode = SymmetryMode.Off
  private _radialCount = 6
  private _snap = false
  private _gridStep = 2
  private _activeLayer = 0
  private _layerVisible: boolean[] = [true, true, true, true]
  private _dominantHand: "right" | "left" = "right"
  private _showGrid = true
  private _showMannequin = false
  private _presentation = false
  private _softRadius = 6
  private _extrude = false
  private _noteText = NOTE_PRESETS[0]
  /** Currently selected item ids. */
  private _selection: string[] = []
  /** Recently used colors, newest first. */
  readonly recentColors: [number, number, number][] = []

  get tool(): ToolId {
    return this._tool
  }
  set tool(v: ToolId) {
    this.set("tool", () => (this._tool = v), this._tool !== v)
  }

  get section(): CrossSection {
    return this._section
  }
  set section(v: CrossSection) {
    this.set("section", () => (this._section = v), this._section !== v)
  }

  /** Brush diameter / surface width in cm. */
  get width(): number {
    return this._width
  }
  set width(v: number) {
    const c = Math.max(0.1, Math.min(20, v))
    this.set("width", () => (this._width = c), this._width !== c)
  }

  /** Stroke smoothing in [0, 1]. */
  get smoothing(): number {
    return this._smoothing
  }
  set smoothing(v: number) {
    const c = Math.max(0, Math.min(1, v))
    this.set("smoothing", () => (this._smoothing = c), this._smoothing !== c)
  }

  get taper(): boolean {
    return this._taper
  }
  set taper(v: boolean) {
    this.set("taper", () => (this._taper = v), this._taper !== v)
  }

  /** Draw on the plane defined by the non-dominant palm. */
  get planar(): boolean {
    return this._planar
  }
  set planar(v: boolean) {
    this.set("planar", () => (this._planar = v), this._planar !== v)
  }

  get color(): [number, number, number] {
    return this._color
  }
  set color(v: [number, number, number]) {
    const same = this._color[0] === v[0] && this._color[1] === v[1] && this._color[2] === v[2]
    this.set(
      "color",
      () => {
        this._color = [v[0], v[1], v[2]]
        const existing = this.recentColors.findIndex((c) => c[0] === v[0] && c[1] === v[1] && c[2] === v[2])
        if (existing >= 0) {
          this.recentColors.splice(existing, 1)
        }
        this.recentColors.unshift([v[0], v[1], v[2]])
        if (this.recentColors.length > 6) {
          this.recentColors.pop()
        }
      },
      !same
    )
  }

  get material(): MaterialPreset {
    return this._material
  }
  set material(v: MaterialPreset) {
    this.set("material", () => (this._material = v), this._material !== v)
  }

  get surfaceMode(): SurfaceMode {
    return this._surfaceMode
  }
  set surfaceMode(v: SurfaceMode) {
    this.set("surfaceMode", () => (this._surfaceMode = v), this._surfaceMode !== v)
  }

  get primitive(): PrimitiveKind {
    return this._primitive
  }
  set primitive(v: PrimitiveKind) {
    this.set("primitive", () => (this._primitive = v), this._primitive !== v)
  }

  get cage(): CageKind {
    return this._cage
  }
  set cage(v: CageKind) {
    this.set("cage", () => (this._cage = v), this._cage !== v)
  }

  get symmetry(): SymmetryMode {
    return this._symmetry
  }
  set symmetry(v: SymmetryMode) {
    this.set("symmetry", () => (this._symmetry = v), this._symmetry !== v)
  }

  get radialCount(): number {
    return this._radialCount
  }
  set radialCount(v: number) {
    const c = Math.max(2, Math.min(16, Math.round(v)))
    this.set("radialCount", () => (this._radialCount = c), this._radialCount !== c)
  }

  get snap(): boolean {
    return this._snap
  }
  set snap(v: boolean) {
    this.set("snap", () => (this._snap = v), this._snap !== v)
  }

  /** Grid spacing in cm (sketch units). */
  get gridStep(): number {
    return this._gridStep
  }
  set gridStep(v: number) {
    this.set("gridStep", () => (this._gridStep = v), this._gridStep !== v)
  }

  get activeLayer(): number {
    return this._activeLayer
  }
  set activeLayer(v: number) {
    const c = Math.max(0, Math.min(LAYER_COUNT - 1, v))
    this.set(
      "layers",
      () => {
        this._activeLayer = c
        this._layerVisible[c] = true
      },
      this._activeLayer !== c
    )
  }

  isLayerVisible(layer: number): boolean {
    return this._layerVisible[layer] !== false
  }

  setLayerVisible(layer: number, visible: boolean): void {
    this.set("layers", () => (this._layerVisible[layer] = visible), this._layerVisible[layer] !== visible)
  }

  get dominantHand(): "right" | "left" {
    return this._dominantHand
  }
  set dominantHand(v: "right" | "left") {
    this.set("dominantHand", () => (this._dominantHand = v), this._dominantHand !== v)
  }

  get showGrid(): boolean {
    return this._showGrid
  }
  set showGrid(v: boolean) {
    this.set("showGrid", () => (this._showGrid = v), this._showGrid !== v)
  }

  get showMannequin(): boolean {
    return this._showMannequin
  }
  set showMannequin(v: boolean) {
    this.set("showMannequin", () => (this._showMannequin = v), this._showMannequin !== v)
  }

  /** Presentation (turntable) mode: hides tools and slowly rotates the sketch. */
  get presentation(): boolean {
    return this._presentation
  }
  set presentation(v: boolean) {
    this.set("presentation", () => (this._presentation = v), this._presentation !== v)
  }

  /** Falloff radius of soft edits in cm. */
  get softRadius(): number {
    return this._softRadius
  }
  set softRadius(v: number) {
    const c = Math.max(0.5, Math.min(40, v))
    this.set("softRadius", () => (this._softRadius = c), this._softRadius !== c)
  }

  /** SubD edit: dragging a face extrudes it instead of moving it. */
  get extrude(): boolean {
    return this._extrude
  }
  set extrude(v: boolean) {
    this.set("extrude", () => (this._extrude = v), this._extrude !== v)
  }

  /** Text the Notes tool pins next. */
  get noteText(): string {
    return this._noteText
  }
  set noteText(v: string) {
    const c = v.slice(0, NOTE_MAX_LENGTH)
    this.set("noteText", () => (this._noteText = c), this._noteText !== c)
  }

  get selection(): string[] {
    return this._selection
  }
  set selection(ids: string[]) {
    const same = ids.length === this._selection.length && ids.every((id, i) => id === this._selection[i])
    this.set("selection", () => (this._selection = ids.slice()), !same)
  }

  toast(message: string): void {
    this.onToast.emit(message)
  }

  private set(key: SettingKey, apply: () => void, changed: boolean): void {
    if (!changed) {
      return
    }
    apply()
    this.onChanged.emit(key)
  }
}
