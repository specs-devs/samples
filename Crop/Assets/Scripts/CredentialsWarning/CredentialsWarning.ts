import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import {RoundedRectangle, RoundedRectBlendMode} from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangle"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {setTimeout} from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils"
import {GuideDismissPanel} from "../GuideDismissPanel/GuideDismissPanel"

const FRAME_PADDING = 2
const TEXT_WIDTH = 34
const TEXT_SIZE = 40
const BUTTON_WIDTH = 30
const BUTTON_HEIGHT = 5
const BUTTON_GAP = 1.5
const CONTENT_Z = 0.5
const LABEL_Z = 0.3
const LABEL_SIZE = 56
const BORDER_SIZE = 0.6
const CONTENT_RENDER_ORDER = 20
// In front of the guide, so the warning is always read first.
const WARNING_DISTANCE = 100
const RED = new vec4(0.94, 0.27, 0.27, 1)
const UNSET_TOKEN = /^\s*$|^\[INSERT/i
// The guide comes back after the pinch that closed the warning is over, so that pinch can't also press its button.
const REVEAL_DELAY_MS = 300

/**
 * Shows a red-framed warning before the guide when the credentials the examples need are missing:
 * the Snap Cloud project on `SnapCloudRequirements` and/or the Remote Service Gateway tokens on
 * `RemoteServiceGatewayCredentials`. Everything configured: this object turns itself off and the
 * guide appears as usual. Otherwise the guide (and what it hides) waits until "Continue" is pressed.
 *
 * Both requirement components are referenced as plain ScriptComponents, so this script works in any
 * project whether or not it bundles Snap Cloud or Remote Service Gateway.
 */
@component
export class CredentialsWarning extends BaseScriptComponent {
  @input
  @hint("The guide shown after this warning (its GuideDismissPanel keeps hiding the rest until 'Ok, I understood')")
  guide: SceneObject

  @input
  @allowUndefined
  @hint("SnapCloudRequirements component holding the Supabase project. Empty: Snap Cloud isn't checked.")
  snapCloudRequirements: ScriptComponent

  @input
  @allowUndefined
  @hint("RemoteServiceGatewayCredentials component. Empty: Remote Service Gateway tokens aren't checked.")
  rsgCredentials: ScriptComponent

  @input
  @hint("The examples need the Snap token (Snap-hosted models and the RSG proxy)")
  requireSnapToken: boolean = false

  @input
  @hint("The examples need the OpenAI token")
  requireOpenAIToken: boolean = false

  @input
  @hint("The examples need the Google (Gemini) token")
  requireGoogleToken: boolean = false

  @input
  @hint("Label of the button that closes the warning")
  buttonLabel: string = "Continue without credentials"

  private held: SceneObject[] = []

  onAwake(): void {
    const missing = this.findMissing()
    if (missing.length === 0) {
      this.sceneObject.enabled = false
      return
    }
    for (const line of missing) {
      print("CredentialsWarning: " + line)
    }
    this.holdGuide()
    this.createEvent("OnStartEvent").bind(() => this.build(missing))
  }

  /** What is missing, one line per credential, with where to set it. */
  public findMissing(): string[] {
    const missing: string[] = []
    const cloud = this.snapCloudRequirements as any
    if (cloud) {
      const configured = typeof cloud.isConfigured === "function" ? cloud.isConfigured() : !!cloud.supabaseProject
      if (!configured) {
        missing.push(
          "Snap Cloud project: assign a SupabaseProject on SnapCloudRequirements (Window > Supabase > Import Credentials)"
        )
      }
    }
    const rsg = this.rsgCredentials as any
    if (rsg) {
      const tokens: [boolean, string, string][] = [
        [this.requireSnapToken, "snapToken", "Snap"],
        [this.requireOpenAIToken, "openAIToken", "OpenAI"],
        [this.requireGoogleToken, "googleToken", "Google"]
      ]
      for (const [required, field, name] of tokens) {
        if (required && UNSET_TOKEN.test(String(rsg[field] ?? ""))) {
          missing.push(`Remote Service Gateway: set the ${name} token on RemoteServiceGatewayCredentials`)
        }
      }
    }
    return missing
  }

  /** Keeps the guide, and whatever it would reveal, off until the warning is closed. */
  private holdGuide(): void {
    if (!this.guide) {
      return
    }
    const guidePanel = this.guide.getComponent(GuideDismissPanel.getTypeName()) as GuideDismissPanel
    const waiting = guidePanel ? guidePanel.hideUntilDismissed : []
    if (!waiting) {
      // The guide isn't awake yet (it sits below this object): it hides its own list on awake, so only hold the guide, on start.
      this.createEvent("OnStartEvent").bind(() => this.hold([this.guide]))
      return
    }
    // Objects the guide hasn't hidden yet (it hides them on its own awake) are held here too.
    this.hold([...waiting, this.guide])
  }

  private hold(objects: SceneObject[]): void {
    this.held = objects.filter((object) => !!object && object.enabled)
    this.held.forEach((object) => {
      object.enabled = false
    })
  }

  private dismiss(): void {
    this.sceneObject.enabled = false
    // Not on this object's own events: they stop once it is disabled.
    setTimeout(() => this.reveal(), REVEAL_DELAY_MS)
  }

  private reveal(): void {
    // Re-enable the guide last: if it wakes up now, it hides the others again itself.
    const guide = this.held.filter((object) => object === this.guide)
    this.held
      .filter((object) => object !== this.guide)
      .forEach((object) => {
        object.enabled = true
      })
    guide.forEach((object) => {
      object.enabled = true
    })
    this.held = []
  }

  private build(missing: string[]): void {
    this.placeInFrontOfUser(WARNING_DISTANCE)
    const frame = this.sceneObject.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.allowTranslation = true
    frame.onInitialized.add(() => this.populate(frame, missing))
  }

  private populate(frame: Frame, missing: string[]): void {
    frame.renderOrder = CONTENT_RENDER_ORDER - 1

    const textObject = this.createChild(frame.content, "CredentialsWarningText", new vec3(0, 0, CONTENT_Z))
    const text = textObject.createComponent("Component.Text")
    text.text = "Credentials needed\n\n" + missing.map((line) => "• " + line).join("\n") +
      "\n\nThe examples that use them won't work until they are set."
    text.size = TEXT_SIZE
    text.textFill.color = new vec4(1, 1, 1, 1)
    text.horizontalAlignment = HorizontalAlignment.Left
    text.verticalAlignment = VerticalAlignment.Top
    text.horizontalOverflow = HorizontalOverflow.Wrap
    text.verticalOverflow = VerticalOverflow.Overflow
    text.layoutRect = Rect.create(-TEXT_WIDTH / 2, TEXT_WIDTH / 2, -40, 0)
    text.depthTest = true
    text.renderOrder = CONTENT_RENDER_ORDER + 1

    const buttonObject = this.createChild(frame.content, "CredentialsWarningButton", new vec3(0, 0, CONTENT_Z))
    const button = buttonObject.createComponent(RectangleButton.getTypeName()) as RectangleButton
    button.size = new vec3(BUTTON_WIDTH, BUTTON_HEIGHT, 1)
    button.renderOrder = CONTENT_RENDER_ORDER
    button.initialize()
    this.createLabel(buttonObject)
    button.onTriggerUp.add(() => this.dismiss())

    this.layOut(frame, text, buttonObject)
  }

  /** Text above the button, frame sized around both, red border just inside the frame edge. */
  private layOut(frame: Frame, text: Text, buttonObject: SceneObject): void {
    const bounds = text.getBoundingBox()
    let height = bounds.top - bounds.bottom
    if (!(height > 0)) {
      height = 20
    }
    const width = TEXT_WIDTH
    const innerHeight = height + BUTTON_GAP + BUTTON_HEIGHT
    text.getSceneObject().getTransform().setLocalPosition(new vec3(0, innerHeight / 2 - bounds.top, CONTENT_Z))
    buttonObject.getTransform().setLocalPosition(new vec3(0, -innerHeight / 2 + BUTTON_HEIGHT / 2, CONTENT_Z))

    const size = new vec2(width + FRAME_PADDING * 2, innerHeight + FRAME_PADDING * 2)
    const autoScale = frame.autoScaleContent
    frame.autoScaleContent = false
    frame.innerSize = size
    frame.syncScaleBaseline()
    frame.autoScaleContent = autoScale

    const borderObject = this.createChild(frame.content, "CredentialsWarningBorder", new vec3(0, 0, CONTENT_Z / 2))
    const border = borderObject.createComponent(RoundedRectangle.getTypeName()) as RoundedRectangle
    border.size = size
    border.cornerRadius = 1.5
    // The default blend mode is Disabled, which draws the translucent tint as solid red.
    border.blendMode = RoundedRectBlendMode.Normal
    border.backgroundColor = new vec4(RED.r, RED.g, RED.b, 0.12)
    border.border = true
    border.borderSize = BORDER_SIZE
    border.borderColor = RED
    // The RenderMeshVisual only exists once the shape starts; this setter is applied then.
    border.renderOrder = CONTENT_RENDER_ORDER
  }

  /** Puts the warning in front of the user's head pose, facing them. */
  private placeInFrontOfUser(distance: number): void {
    const camera = WorldCameraFinderProvider.getInstance()
    const position = camera.getWorldPosition()
    let forward = camera.getForwardPositionParallelToGround(1).sub(position)
    forward = forward.length > 0.0001 ? forward.normalize() : new vec3(0, 0, -1)
    const transform = this.getTransform()
    transform.setWorldPosition(position.add(forward.uniformScale(distance)))
    transform.setWorldRotation(quat.lookAt(forward.uniformScale(-1), vec3.up()))
  }

  private createLabel(parent: SceneObject): void {
    const labelObject = this.createChild(parent, "Label", new vec3(0, 0, LABEL_Z))
    const label = labelObject.createComponent("Component.Text")
    label.text = this.buttonLabel
    label.size = LABEL_SIZE
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
