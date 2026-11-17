/**
 * SPECS Inc. 2027
 * CustomVisualsGallery – six custom visuals for UI Kit buttons, built at runtime on one panel.
 *
 * Each card is a UI Kit RectangleButton whose visual is replaced by a RoundedRectangleVisual with its
 * own per-state style (default / hovered / triggered / toggled). The technique each card shows:
 *   Glass     translucent fill + thin border that brighten on hover, press shrinks it
 *   Accent    solid brand color, darker when pressed
 *   Outline   transparent fill, border thickens and the fill appears on hover
 *   Gradient  two-stop linear gradient that lightens on hover
 *   Lift      the card moves toward you on hover and back when pressed (state localPosition)
 *   Toggle    a toggleable button: the toggled states use their own color
 *
 * Specs displays are additive: dark colors read as transparent, so fills stay mid-tone or brighter.
 */
import {RectangleButton} from "UIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {Frame} from "UIKit.lspkg/Scripts/Components/Frame/Frame"
import {StateName} from "UIKit.lspkg/Scripts/Components/Element"
import {RoundedRectangleVisual, RoundedRectangleVisualState} from "UIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangleVisual"
import {GradientParameters} from "UIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"

const COLS = 3
const CARD = new vec2(10, 4.6)
const GAP = 1.5
const CAPTION_H = 2.2
const PAD = 2
const TITLE_H = 3
const CONTENT_Z = 0.5
const BUTTON_DEPTH = 1
// Labels sit in front of the button face (half its depth) so they never z-fight with it.
const LABEL_Z = BUTTON_DEPTH / 2 + 0.15
const RENDER_ORDER = 100

const rgba = (r: number, g: number, b: number, a: number = 1) => new vec4(r, g, b, a)
const gradient = (top: vec4, bottom: vec4): GradientParameters => ({
  enabled: true,
  type: "Linear",
  start: new vec2(0, 1),
  end: new vec2(0, -1),
  stop0: {enabled: true, percent: 0, color: top},
  stop1: {enabled: true, percent: 1, color: bottom},
  stop2: {enabled: false, percent: 1, color: bottom},
  stop3: {enabled: false, percent: 1, color: bottom}
})

type Card = {
  title: string
  caption: string
  textColor: vec4
  toggle?: boolean
  style: Partial<Record<StateName, RoundedRectangleVisualState>>
}

const PRESS = new vec3(0.96, 0.96, 0.96)
const CARDS: Card[] = [
  {
    title: "Glass",
    caption: "Translucent fill and a thin border that brighten on hover",
    textColor: rgba(1, 1, 1),
    style: {
      default: {baseType: "Color", baseColor: rgba(1, 1, 1, 0.08), hasBorder: true, borderType: "Color", borderSize: 0.06, borderColor: rgba(1, 1, 1, 0.35)},
      hovered: {baseType: "Color", baseColor: rgba(1, 1, 1, 0.16), hasBorder: true, borderType: "Color", borderSize: 0.08, borderColor: rgba(1, 1, 1, 0.8)},
      triggered: {baseType: "Color", baseColor: rgba(1, 1, 1, 0.24), hasBorder: true, borderType: "Color", borderSize: 0.08, borderColor: rgba(1, 1, 1, 1), shouldScale: true, localScale: PRESS}
    }
  },
  {
    title: "Accent",
    caption: "Solid brand color, darker while pressed",
    textColor: rgba(0.08, 0.08, 0.1),
    style: {
      default: {baseType: "Color", baseColor: rgba(1, 0.86, 0.2), hasBorder: false},
      hovered: {baseType: "Color", baseColor: rgba(1, 0.92, 0.45), hasBorder: false},
      triggered: {baseType: "Color", baseColor: rgba(0.85, 0.7, 0.1), hasBorder: false, shouldScale: true, localScale: PRESS}
    }
  },
  {
    title: "Outline",
    caption: "Border only; it thickens and the fill appears on hover",
    textColor: rgba(0.45, 0.85, 1),
    style: {
      default: {baseType: "Color", baseColor: rgba(0.45, 0.85, 1, 0.02), hasBorder: true, borderType: "Color", borderSize: 0.08, borderColor: rgba(0.45, 0.85, 1, 0.9)},
      hovered: {baseType: "Color", baseColor: rgba(0.45, 0.85, 1, 0.15), hasBorder: true, borderType: "Color", borderSize: 0.16, borderColor: rgba(0.45, 0.85, 1, 1)},
      triggered: {baseType: "Color", baseColor: rgba(0.45, 0.85, 1, 0.3), hasBorder: true, borderType: "Color", borderSize: 0.16, borderColor: rgba(0.7, 0.95, 1, 1), shouldScale: true, localScale: PRESS}
    }
  },
  {
    title: "Gradient",
    caption: "Two-stop gradient that lightens on hover",
    textColor: rgba(1, 1, 1),
    style: {
      default: {baseType: "Gradient", baseGradient: gradient(rgba(0.35, 0.4, 0.95), rgba(0.2, 0.15, 0.5)), hasBorder: false},
      hovered: {baseType: "Gradient", baseGradient: gradient(rgba(0.5, 0.55, 1), rgba(0.3, 0.25, 0.65)), hasBorder: false},
      triggered: {baseType: "Gradient", baseGradient: gradient(rgba(0.28, 0.3, 0.8), rgba(0.15, 0.1, 0.4)), hasBorder: false, shouldScale: true, localScale: PRESS}
    }
  },
  {
    title: "Lift",
    caption: "Moves toward you on hover, back down when pressed",
    textColor: rgba(1, 1, 1),
    style: {
      default: {baseType: "Color", baseColor: rgba(0.4, 0.44, 0.52), hasBorder: false, shouldPosition: true, localPosition: new vec3(0, 0, 0)},
      hovered: {baseType: "Color", baseColor: rgba(0.5, 0.54, 0.62), hasBorder: false, shouldPosition: true, localPosition: new vec3(0, 0, 1.2)},
      triggered: {baseType: "Color", baseColor: rgba(0.45, 0.49, 0.57), hasBorder: false, shouldPosition: true, localPosition: new vec3(0, 0, 0.3)}
    }
  },
  {
    title: "Toggle",
    caption: "Toggleable: the toggled states have their own color",
    textColor: rgba(1, 1, 1),
    toggle: true,
    style: {
      default: {baseType: "Color", baseColor: rgba(0.4, 0.44, 0.52), hasBorder: false},
      hovered: {baseType: "Color", baseColor: rgba(0.5, 0.54, 0.62), hasBorder: false},
      triggered: {baseType: "Color", baseColor: rgba(0.18, 0.62, 0.38), hasBorder: false},
      toggledDefault: {baseType: "Color", baseColor: rgba(0.18, 0.62, 0.38), hasBorder: false},
      toggledHovered: {baseType: "Color", baseColor: rgba(0.24, 0.72, 0.46), hasBorder: false},
      toggledTriggered: {baseType: "Color", baseColor: rgba(0.4, 0.44, 0.52), hasBorder: false}
    }
  }
]

@component
export class CustomVisualsGallery extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CustomVisualsGallery – six custom visuals for UI Kit buttons</span><br/><span style="color: #94A3B8; font-size: 11px;">Builds its own panel at runtime. Each card replaces the button visual with a RoundedRectangleVisual style.</span>')
  @ui.separator

  @input
  @hint("Panel title")
  title: string = "Custom visuals"

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.build())
  }

  private build(): void {
    const rows = Math.ceil(CARDS.length / COLS)
    const width = COLS * CARD.x + (COLS - 1) * GAP + 2 * PAD
    const height = TITLE_H + rows * (CARD.y + CAPTION_H) + (rows - 1) * GAP + 2 * PAD
    const frameObject = this.child(this.sceneObject, "GalleryFrame", vec3.zero())
    const frame = frameObject.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.allowTranslation = true
    frame.innerSize = new vec2(width, height)
    frame.onInitialized.add(() => {
      frame.renderOrder = RENDER_ORDER - 1
      const root = frame.content
      this.label(root, this.title, new vec3(0, height / 2 - PAD - TITLE_H / 2 + 0.5, CONTENT_Z), width - 2, TITLE_H, 52, rgba(1, 1, 1))
      CARDS.forEach((card, i) => {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const x = -width / 2 + PAD + CARD.x / 2 + col * (CARD.x + GAP)
        const top = height / 2 - PAD - TITLE_H - row * (CARD.y + CAPTION_H + GAP)
        this.card(root, card, new vec3(x, top - CARD.y / 2, CONTENT_Z), new vec3(x, top - CARD.y - CAPTION_H / 2, CONTENT_Z))
      })
    })
  }

  private card(parent: SceneObject, card: Card, position: vec3, captionPosition: vec3): void {
    const buttonObject = this.child(parent, card.title, position)
    const button = buttonObject.createComponent(RectangleButton.getTypeName()) as RectangleButton
    button.size = new vec3(CARD.x, CARD.y, BUTTON_DEPTH)
    button.renderOrder = RENDER_ORDER
    if (card.toggle) button.setIsToggleable(true)
    // Swap in the custom visual before initialize(), so the button builds with it.
    // transparent: alpha in the colors is honoured (Glass and Outline are see-through on purpose).
    button.visual = new RoundedRectangleVisual({sceneObject: buttonObject, style: card.style, transparent: true})
    button.initialize()
    this.label(buttonObject, card.title, new vec3(0, 0, LABEL_Z), CARD.x - 1, CARD.y, 44, card.textColor)
    this.label(parent, card.caption, captionPosition, CARD.x + GAP - 0.4, CAPTION_H, 30, rgba(0.75, 0.78, 0.82), true)
    button.onTriggerUp.add(() => print(`Custom visuals: ${card.title}${card.toggle ? (button.isOn ? " on" : " off") : ""}`))
  }

  private label(parent: SceneObject, text: string, position: vec3, width: number, height: number, size: number, color: vec4, wrap = false): Text {
    const t = this.child(parent, "Label", position).createComponent("Component.Text") as Text
    t.text = text
    t.size = size
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = wrap ? HorizontalOverflow.Wrap : HorizontalOverflow.Shrink
    t.verticalOverflow = VerticalOverflow.Shrink
    t.layoutRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2)
    t.depthTest = true
    t.renderOrder = RENDER_ORDER + 2
    return t
  }

  private child(parent: SceneObject, name: string, position: vec3): SceneObject {
    const o = global.scene.createSceneObject(name)
    o.setParent(parent)
    o.getTransform().setLocalPosition(position)
    return o
  }
}
