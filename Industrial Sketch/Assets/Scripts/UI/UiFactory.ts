/**
 * SPECS Inc. 2027
 * Runtime construction helpers for UI Kit buttons, sliders, labels and color swatches.
 */
import {RectangleButton} from "UIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {RoundButton} from "UIKit.lspkg/Scripts/Components/Button/RoundButton"
import {Slider} from "UIKit.lspkg/Scripts/Components/Slider/Slider"
import {MeshData} from "../Geometry/MeshData"
import {buildSphere} from "../Geometry/Primitives"
import {MeshDisplay} from "../Render/MeshFactory"

export const UI_RENDER_ORDER = 20
const LABEL_Z = 0.35

export interface UiButton {
  root: SceneObject
  button: RectangleButton
  label: Text
  setOn(on: boolean): void
  setLabel(text: string): void
  setInactive(inactive: boolean): void
}

export interface UiSlider {
  root: SceneObject
  slider: Slider
  label: Text
  setValue(v: number): void
  setLabel(text: string): void
}

export interface UiSwatch {
  root: SceneObject
  button: RoundButton
  ball: MeshDisplay
  setOn(on: boolean): void
}

export function createChild(
  parent: SceneObject,
  name: string,
  x: number = 0,
  y: number = 0,
  z: number = 0
): SceneObject {
  const child = global.scene.createSceneObject(name)
  child.setParent(parent)
  child.getTransform().setLocalPosition(new vec3(x, y, z))
  return child
}

/** World-space text that shrinks to fit a `width` x `height` cm box. */
export function createLabel(
  parent: SceneObject,
  text: string,
  width: number,
  height: number,
  options: {size?: number; align?: HorizontalAlignment; color?: vec4; z?: number; renderOrder?: number} = {}
): Text {
  const obj = createChild(parent, "Label", 0, 0, options.z ?? LABEL_Z)
  const label = obj.createComponent("Component.Text")
  label.text = text
  label.size = options.size ?? 48
  label.textFill.color = options.color ?? new vec4(1, 1, 1, 1)
  label.horizontalAlignment = options.align ?? HorizontalAlignment.Center
  label.verticalAlignment = VerticalAlignment.Center
  label.horizontalOverflow = HorizontalOverflow.Shrink
  label.verticalOverflow = VerticalOverflow.Shrink
  label.layoutRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2)
  label.depthTest = true
  label.renderOrder = options.renderOrder ?? UI_RENDER_ORDER + 2
  return label
}

export function createButton(
  parent: SceneObject,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  onTap: () => void,
  toggle: boolean = false
): UiButton {
  const root = createChild(parent, "Button " + text, x, y, 0)
  const button = root.createComponent(RectangleButton.getTypeName()) as RectangleButton
  button.size = new vec3(width, height, 1)
  button.renderOrder = UI_RENDER_ORDER
  if (toggle) {
    button.setIsToggleable(true)
  }
  button.initialize()
  const label = createLabel(root, text, width - 0.8, height - 0.6)
  button.onTriggerUp.add(() => onTap())
  return {
    root,
    button,
    label,
    setOn: (on: boolean) => {
      if (toggle && button.isOn !== on) {
        button.isOn = on
      }
    },
    setLabel: (t: string) => {
      if (label.text !== t) {
        label.text = t
      }
    },
    setInactive: (inactive: boolean) => {
      if (button.inactive !== inactive) {
        button.inactive = inactive
      }
      label.textFill.color = inactive ? new vec4(1, 1, 1, 0.35) : new vec4(1, 1, 1, 1)
    }
  }
}

export function createSlider(
  parent: SceneObject,
  text: string,
  x: number,
  y: number,
  width: number,
  initial: number,
  onChange: (value: number) => void
): UiSlider {
  const root = createChild(parent, "Slider " + text, x, y, 0)
  const labelWidth = Math.min(9, width * 0.38)
  const label = createLabel(root, text, labelWidth, 2, {align: HorizontalAlignment.Left, size: 40})
  label
    .getSceneObject()
    .getTransform()
    .setLocalPosition(new vec3(-width / 2 + labelWidth / 2, 0, LABEL_Z))
  const sliderObj = createChild(root, "Track", labelWidth / 2 + 0.3, 0, 0)
  const slider = sliderObj.createComponent(Slider.getTypeName()) as Slider
  slider.size = new vec3(width - labelWidth - 0.6, 2.4, 1)
  slider.renderOrder = UI_RENDER_ORDER
  // A pinch anywhere on the track jumps there: much easier with hands than grabbing the knob.
  ;(slider as unknown as {snapToTriggerPosition: boolean}).snapToTriggerPosition = true
  slider.initialize()
  // Programmatic updates (refreshing the palette from the app state) must not echo back as user input.
  let suppress = true
  slider.currentValue = Math.max(0, Math.min(1, initial))
  suppress = false
  slider.onValueChange.add((v: number) => {
    if (!suppress) {
      onChange(v)
    }
  })
  return {
    root,
    slider,
    label,
    setValue: (v: number) => {
      const c = Math.max(0, Math.min(1, v))
      if (!slider.isDragging && Math.abs(slider.currentValue - c) > 1e-3) {
        suppress = true
        slider.currentValue = c
        suppress = false
      }
    },
    setLabel: (t: string) => {
      if (label.text !== t) {
        label.text = t
      }
    }
  }
}

const SWATCH_MESH: MeshData = buildSphere(20, 14)

/** A round button with a material-preview ball in front of it. */
export function createSwatch(
  parent: SceneObject,
  x: number,
  y: number,
  diameter: number,
  material: Material,
  onTap: () => void
): UiSwatch {
  const root = createChild(parent, "Swatch", x, y, 0)
  const button = root.createComponent(RoundButton.getTypeName()) as RoundButton
  button.width = diameter
  button.renderOrder = UI_RENDER_ORDER
  button.setIsToggleable(true)
  button.initialize()
  button.onTriggerUp.add(() => onTap())
  const ball = new MeshDisplay(root, "Ball")
  ball.setMesh(SWATCH_MESH)
  ball.setMaterial(material)
  const t = ball.sceneObject.getTransform()
  t.setLocalPosition(new vec3(0, 0, 0.9))
  const s = diameter * 0.62
  t.setLocalScale(new vec3(s, s, s))
  return {
    root,
    button,
    ball,
    setOn: (on: boolean) => {
      if (button.isOn !== on) {
        button.isOn = on
      }
    }
  }
}
