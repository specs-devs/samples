import {Button} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

const FRAME_PADDING = 2
const BUTTON_WIDTH = 20
const BUTTON_HEIGHT = 5
const BUTTON_GAP = 1.5
const CONTENT_Z = 0.5
const LABEL_Z = 0.3
const LABEL_SIZE = 64
const CONTENT_RENDER_ORDER = 10
// Pulls the guide toward the viewer so it never shares a depth plane with other panels.
const FRAME_FORWARD_OFFSET = 10
// Distance (cm) in front of the head pose where the guide appears.
const GUIDE_DISTANCE = 110

/**
 * Shows the project's guide on a UIKit Frame with a button at the bottom.
 * Pressing the button disables the guide and reveals the objects listed in
 * `hideUntilDismissed`, so the guide is the only thing on screen until then.
 *
 * Authored setup (the GuidePanel prefab): this component sits on the guide
 * root next to a UIKit Frame, with a child Text (the message) and a child UIKit
 * Button. The component then only places the panel in front of the user, fits
 * the frame to the text, and closes the guide when the button is pressed.
 *
 * Text-only setup (older projects): without a Frame on this SceneObject, the
 * panel is built at runtime from the guide's Text instead.
 */
@component
export class GuideDismissPanel extends BaseScriptComponent {
  @input
  @hint("Label of the button that closes the guide (only used when the panel is built at runtime)")
  buttonLabel: string = "Ok, I understood"

  @input
  @hint("Objects hidden while the guide is shown and enabled again when it is closed")
  hideUntilDismissed: SceneObject[] = []

  private built = false
  private hidden: SceneObject[] = []

  onAwake(): void {
    // Hide before any other script starts, so e.g. a carousel doesn't enable its first example.
    this.hidden = this.hideUntilDismissed.filter((object) => !!object && object.enabled)
    this.hidden.forEach((object) => {
      object.enabled = false
    })
    this.createEvent("OnStartEvent").bind(() => this.build())
  }

  private dismiss(): void {
    this.sceneObject.enabled = false
    this.hidden.forEach((object) => {
      object.enabled = true
    })
    this.hidden = []
  }

  private build(): void {
    if (this.built) {
      return
    }
    this.built = true

    const frame = this.sceneObject.getComponent(Frame.getTypeName()) as Frame
    if (frame) {
      this.placeInFrontOfUser(GUIDE_DISTANCE - FRAME_FORWARD_OFFSET)
      this.useAuthoredPanel(frame)
      return
    }
    this.placeInFrontOfUser(GUIDE_DISTANCE)
    this.buildPanel()
  }

  /** Authored Frame + Text + Button: wire the button and fit the frame to the text. */
  private useAuthoredPanel(frame: Frame): void {
    const text = this.findChildText(this.sceneObject)
    const button = this.findChildButton(this.sceneObject)
    if (!text || !button) {
      print("GuideDismissPanel: the guide Frame needs a child Text and a child UIKit Button")
      return
    }
    button.onTriggerUp.add(() => this.dismiss())
    // frame.content only exists once the Frame has initialized (on its own OnStart).
    frame.onInitialized.add(() => {
      frame.renderOrder = CONTENT_RENDER_ORDER - 1
      this.layOut(frame, text, button.getSceneObject())
    })
  }

  /** Text-only guide: build the Frame, the text copy and the button at runtime. */
  private buildPanel(): void {
    const source = this.findText(this.sceneObject)
    if (!source) {
      print("GuideDismissPanel: no Text found under " + this.sceneObject.name + ", nothing to present")
      return
    }

    const frameObject = this.createChild(this.sceneObject, "GuideFrame", new vec3(0, 0, FRAME_FORWARD_OFFSET))
    const frame = frameObject.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.allowTranslation = true
    frame.onInitialized.add(() => this.populate(frame, source))
  }

  private populate(frame: Frame, source: Text): void {
    frame.renderOrder = CONTENT_RENDER_ORDER - 1

    const textObject = this.createChild(frame.content, "GuideText", new vec3(0, 0, CONTENT_Z))
    const text = this.copyText(source, textObject)
    source.enabled = false

    const buttonObject = this.createChild(frame.content, "GuideDismissButton", new vec3(0, 0, CONTENT_Z))
    const button = buttonObject.createComponent(RectangleButton.getTypeName()) as RectangleButton
    button.size = new vec3(BUTTON_WIDTH, BUTTON_HEIGHT, 1)
    button.renderOrder = CONTENT_RENDER_ORDER
    button.initialize()
    this.createLabel(buttonObject, text)
    button.onTriggerUp.add(() => this.dismiss())

    this.layOut(frame, text, buttonObject)
  }

  /** Puts the text above the button and sizes the frame around both. */
  private layOut(frame: Frame, text: Text, buttonObject: SceneObject): void {
    const bounds = text.getBoundingBox()
    let width = bounds.right - bounds.left
    let height = bounds.top - bounds.bottom
    if (!(width > 0) || !(height > 0)) {
      width = text.layoutRect.right - text.layoutRect.left
      height = text.layoutRect.top - text.layoutRect.bottom
    }
    width = Math.max(width, BUTTON_WIDTH)

    const innerHeight = height + BUTTON_GAP + BUTTON_HEIGHT
    const textCenter = bounds.getCenter()
    // Center the text horizontally and keep it above the button row.
    text
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(-textCenter.x, innerHeight / 2 - height / 2 - textCenter.y, CONTENT_Z))
    buttonObject.getTransform().setLocalPosition(new vec3(0, -innerHeight / 2 + BUTTON_HEIGHT / 2, CONTENT_Z))

    // Resize without scaling the content (the Frame scales it against the size it had at
    // init, which would stretch the text), then treat the new size as the 1x baseline.
    const autoScale = frame.autoScaleContent
    frame.autoScaleContent = false
    frame.innerSize = new vec2(width + FRAME_PADDING * 2, innerHeight + FRAME_PADDING * 2)
    frame.syncScaleBaseline()
    frame.autoScaleContent = autoScale
  }

  /** Puts the guide in front of the user's head pose, facing them. */
  private placeInFrontOfUser(distance: number): void {
    const camera = WorldCameraFinderProvider.getInstance()
    const position = camera.getWorldPosition()
    let forward = camera.getForwardPositionParallelToGround(1).sub(position)
    forward = forward.length > 0.0001 ? forward.normalize() : new vec3(0, 0, -1)
    const transform = this.getTransform()
    transform.setWorldPosition(position.add(forward.uniformScale(distance)))
    transform.setWorldRotation(quat.lookAt(forward.uniformScale(-1), vec3.up()))
  }

  private findChildText(root: SceneObject): Text | null {
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const found = this.findText(root.getChild(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private findChildButton(root: SceneObject): Button | null {
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const child = root.getChild(i)
      const button = child.getComponent(Button.getTypeName()) as Button
      if (button) {
        return button
      }
      const nested = this.findChildButton(child)
      if (nested) {
        return nested
      }
    }
    return null
  }

  private findText(root: SceneObject): Text | null {
    const own = root.getComponent("Component.Text")
    if (own) {
      return own
    }
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const found = this.findText(root.getChild(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private copyText(source: Text, target: SceneObject): Text {
    const text = target.createComponent("Component.Text")
    text.text = source.text
    text.size = source.size
    if (source.font) {
      text.font = source.font
    }
    text.textFill.color = source.textFill.color
    text.horizontalAlignment = source.horizontalAlignment
    text.verticalAlignment = source.verticalAlignment
    text.horizontalOverflow = source.horizontalOverflow
    text.verticalOverflow = source.verticalOverflow
    text.layoutRect = source.layoutRect
    text.lineSpacing = source.lineSpacing
    text.letterSpacing = source.letterSpacing
    text.backgroundSettings.enabled = false
    text.depthTest = true
    text.renderOrder = CONTENT_RENDER_ORDER + 1
    return text
  }

  private createLabel(parent: SceneObject, style: Text): void {
    const labelObject = this.createChild(parent, "Label", new vec3(0, 0, LABEL_Z))
    const label = labelObject.createComponent("Component.Text")
    label.text = this.buttonLabel
    label.size = LABEL_SIZE
    if (style.font) {
      label.font = style.font
    }
    label.textFill.color = new vec4(1, 1, 1, 1)
    label.horizontalAlignment = HorizontalAlignment.Center
    label.verticalAlignment = VerticalAlignment.Center
    label.horizontalOverflow = HorizontalOverflow.Shrink
    label.layoutRect = Rect.create(-BUTTON_WIDTH / 2, BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_HEIGHT / 2)
    label.depthTest = true
    label.renderOrder = CONTENT_RENDER_ORDER + 2
  }

  private createChild(parent: SceneObject, name: string, position: vec3): SceneObject {
    const child = global.scene.createSceneObject(name)
    child.setParent(parent)
    child.getTransform().setLocalPosition(position)
    return child
  }
}
