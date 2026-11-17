/**
 * SPECS Inc. 2027
 * Keyboard shortcuts for the Lens Studio Preview, so the whole app can be driven with mouse + keyboard
 * while developing (the device uses the palette). Active in the editor only.
 */
import {AppState, PALETTE, SURFACE_MODES, TOOL_ORDER, ToolId} from "../Core/AppState"
import {MATERIAL_PRESETS} from "../Core/SketchTypes"
import {PRIMITIVE_KINDS} from "../Geometry/Primitives"
import {CAGE_KINDS} from "../Geometry/SubD"
import {SymmetryMode} from "../Geometry/Symmetry"
import {CROSS_SECTIONS} from "../Geometry/TubeBuilder"
import {PaletteHost} from "../UI/Palette"

export const SHORTCUT_HELP = [
  "1-9 tools · D notes",
  "Z undo · Y redo",
  "M mirror · R radial · O symmetry off",
  "N snap · P planar · G grid · K mannequin",
  "C section · X surface mode · B shape · V SubD cage",
  "L finish · H color · E extrude",
  "U duplicate · Backspace delete · W new sketch · A select all · I eyedropper",
  "F frame all · Space reset view · T present",
  "Up/Down brush size · 0 save slot 1 · J open slot 1 · Q export OBJ",
  "S save view 1"
]

function cycle<T>(list: T[], current: T): T {
  const i = list.indexOf(current)
  return list[(i + 1) % list.length]
}

export function bindPreviewShortcuts(script: BaseScriptComponent, state: AppState, host: PaletteHost): void {
  if (!global.deviceInfoSystem.isEditor()) {
    return
  }
  let colorIndex = 8
  const digits = [Keys.One, Keys.Two, Keys.Three, Keys.Four, Keys.Five, Keys.Six, Keys.Seven, Keys.Eight, Keys.Nine]
  script.createEvent("KeyPressEvent").bind((e: KeyPressEvent) => {
    const digit = digits.indexOf(e.key)
    if (digit >= 0 && digit < TOOL_ORDER.length) {
      state.tool = TOOL_ORDER[digit]
      return
    }
    switch (e.key) {
      case Keys.Z:
        host.undo()
        break
      case Keys.Y:
        host.redo()
        break
      case Keys.M:
        state.symmetry = state.symmetry === SymmetryMode.Mirror ? SymmetryMode.Off : SymmetryMode.Mirror
        break
      case Keys.R:
        state.symmetry = SymmetryMode.Radial
        break
      case Keys.O:
        state.symmetry = SymmetryMode.Off
        break
      case Keys.N:
        state.snap = !state.snap
        break
      case Keys.P:
        state.planar = !state.planar
        break
      case Keys.G:
        state.showGrid = !state.showGrid
        break
      case Keys.K:
        state.showMannequin = !state.showMannequin
        break
      case Keys.C:
        state.section = cycle(CROSS_SECTIONS, state.section)
        break
      case Keys.X:
        state.surfaceMode = cycle(SURFACE_MODES, state.surfaceMode)
        break
      case Keys.B:
        state.primitive = cycle(PRIMITIVE_KINDS, state.primitive)
        break
      case Keys.V:
        state.cage = cycle(CAGE_KINDS, state.cage)
        break
      case Keys.L:
        state.material = cycle(MATERIAL_PRESETS, state.material)
        break
      case Keys.H:
        colorIndex = (colorIndex + 1) % PALETTE.length
        state.color = PALETTE[colorIndex]
        break
      case Keys.E:
        state.extrude = !state.extrude
        break
      case Keys.U:
        host.actions.duplicate()
        break
      case Keys.Backspace:
        host.actions.delete()
        break
      case Keys.W:
        host.newSketch()
        break
      case Keys.Q:
        host.exportObj()
        break
      case Keys.A:
        host.actions.selectAll()
        break
      case Keys.I:
        host.eyedropper = !host.eyedropper
        break
      case Keys.F:
        host.frameAll()
        break
      case Keys.Space:
        host.resetView()
        break
      case Keys.T:
        state.presentation = !state.presentation
        break
      case Keys.Up:
        state.width = state.width * 1.25
        break
      case Keys.Down:
        state.width = state.width / 1.25
        break
      case Keys.Zero:
        host.saveSlot(1)
        break
      case Keys.J:
        host.loadSlot(1)
        break
      case Keys.D:
        state.tool = ToolId.Note
        break
      case Keys.S:
        host.saveView(1)
        break
      default:
        return
    }
  })
}
