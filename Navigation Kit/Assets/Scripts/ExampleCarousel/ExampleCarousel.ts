import {RectangleButton} from "UIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {Frame} from "UIKit.lspkg/Scripts/Components/Frame/Frame"
import WorldCameraFinderProvider from "InteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import {GuideDismissPanel} from "../GuideDismissPanel/GuideDismissPanel"

const FRAME_WIDTH = 30
const BUTTON_WIDTH = 10
const BUTTON_HEIGHT = 4
const TITLE_HEIGHT = 4
const INFO_HEIGHT = 5
const ROW_GAP = 0.5
const TOGGLE_SIZE = 3.5
const FRAME_HEIGHT = TITLE_HEIGHT + ROW_GAP + INFO_HEIGHT + ROW_GAP + BUTTON_HEIGHT
// Without Previous / Next the panel ends below the info text.
const SINGLE_STEP_HEIGHT = TITLE_HEIGHT + ROW_GAP + INFO_HEIGHT + ROW_GAP
const CONTENT_Z = 0.5
const LABEL_Z = 0.65 // button labels sit in front of the 1 cm deep button face (+0.5 cm), never inside it
const TITLE_SIZE = 54
const COUNTER_SIZE = 40
const LABEL_SIZE = 46
const INFO_SIZE = 32
// Objects inside an example whose Text becomes that example's info on the carousel (any case).
const EXAMPLE_GUIDE_NAME = "guide_readanddisable"
// High enough that the carousel draws on top of every example's content.
const CONTENT_RENDER_ORDER = 100
// Where the carousel sits relative to the head pose when it starts (cm): in the near field (60 cm), like a
// toolbar the user pokes or pinches directly, low enough that rays aimed at the examples pass over it.
const CAROUSEL_DISTANCE = 60
const CAROUSEL_DROP = 15
// Examples follow the Specs distance guideline: their nearest content sits at 110 cm (far field). Content
// authored between 110 and 160 cm (super far field, for immersive examples) is left where it is.
const EXAMPLE_NEAR_DISTANCE = 110
const EXAMPLE_FAR_DISTANCE = 160
// Each example's visible bounds are recentred vertically this far below eye level (cm).
const EXAMPLE_EYE_DROP = 5
// Delay before measuring a shown example, so UIKit-built content exists (s).
const MEASURE_DELAY = 0.3
// While an example is measured for the first time it waits this far behind the user, out of view (cm).
const MEASURE_HIDE_DISTANCE = 500
// Bounds farther than this from the head when an example is measured are not real content (cm).
const MEASURE_MAX_RANGE = 10000

type HeadPose = {position: vec3; forward: vec3; facing: quat}

/**
 * Shows the project's examples one at a time on a UIKit Frame: the example's name, its
 * instructions and Previous / Next buttons. The "-" / "+" button in the title row collapses the
 * panel to its title bar and expands it again.
 *
 * An example's instructions come from `exampleInfo`, or else from the Text of its guide: an object
 * named `Guide_ReadAndDisable` (any case, the note packages ship inside their prefabs) or one with a
 * GuideDismissPanel. Those guides, and any other instruction text on the packages' blue label
 * background, are hidden before the example is shown: the carousel is the only place instructions
 * appear, and the only "Ok, I understood" panel is the project's overview guide.
 *
 * List the example SceneObjects in `examples`. On start the example at `startIndex` is enabled and
 * every other one is disabled; the buttons step through the list (wrapping around), so each example
 * can be tried in the Lens without toggling objects in the editor. When an example holds several
 * sub-examples, list them in `steps` instead: each step is shown alone, with its parents enabled
 * and the other sub-examples hidden, titled like "Solvers 01 · Billboard".
 *
 * On start the carousel is placed in front of the user's head pose and drawn on top of everything.
 * The examples keep their authored layout (authored for a viewer at the origin looking down -Z),
 * re-anchored to the same head pose and pushed `examplesPushBack` further away, so they appear in
 * front of the user and behind the carousel. The first time an example is shown it is measured out
 * of view, and if any of it would be closer than the carousel the whole example is pushed back.
 */
@component
export class ExampleCarousel extends BaseScriptComponent {
  @input
  @hint("The examples to step through, in order. Only one is enabled at a time.")
  examples: SceneObject[] = []

  @input
  @hint("What each example shows, in the same order as `examples`. Empty entries fall back to the example's own guide text.")
  exampleInfo: string[] = []

  @input
  @hint("Optional sub-examples to step through, in order (e.g. each solver). Each one is shown alone with its parents. Empty: step through `examples`.")
  steps: SceneObject[] = []

  @input
  @hint("What each step shows, in the same order as `steps`. Empty entries fall back to the step's example info.")
  stepInfo: string[] = []

  @input
  @hint("Example shown first (0-based)")
  startIndex: number = 0

  @input
  @hint("Label of the button that shows the previous example")
  previousLabel: string = "Previous"

  @input
  @hint("Label of the button that shows the next example")
  nextLabel: string = "Next"

  @input
  @hint("Extra distance (cm) the examples are pushed away from the user, behind the carousel")
  examplesPushBack: number = 20

  @input
  @hint("Move the examples in front of the user's head pose. Turn off for world-anchored experiences (surface placement, navigation) that must stay where they are.")
  anchorExamples: boolean = true

  @input
  @hint("Start with the panel collapsed to its title bar (useful when it only carries guidance for a single experience)")
  startMinimized: boolean = false

  @input
  @hint("Extra drop (cm) of the panel below its usual spot. Increase it when the examples show their own hints at eye level (e.g. surface placement).")
  extraPanelDrop: number = 0

  private index = 0
  private title: Text | null = null
  private info: Text | null = null
  private counter: Text | null = null
  private infos: string[] = []
  // What the Previous / Next buttons step through: sub-examples, or the examples themselves.
  private stepList: SceneObject[] = []
  private stepRoots: number[] = []
  private stepTitles: string[] = []
  // Every object between a step and its example, so other sub-examples' parents can be hidden.
  private containers: SceneObject[] = []
  private head: HeadPose | null = null
  private frame: Frame | null = null
  private header: SceneObject | null = null
  private body: SceneObject | null = null
  private toggleLabel: Text | null = null
  private minimized = false
  private expandedHeight = FRAME_HEIGHT
  // Each example's local position under the anchor, and the push it needs once measured.
  private anchoredPositions: vec3[] = []
  private offsets: (vec3 | null)[] = []

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.build())
  }

  private build(): void {
    const examples = this.examples.filter((example) => !!example)
    if (examples.length === 0) {
      print("ExampleCarousel: no examples listed on " + this.sceneObject.name)
      return
    }
    this.examples = examples
    this.resolveSteps()
    this.infos = this.examples.map((example, i) => {
      const guideText = this.takeGuideText(example)
      const info = (this.exampleInfo[i] || "").trim()
      return info.length > 0 ? info : guideText
    })

    const head = this.headPose()
    this.head = head
    if (this.anchorExamples) {
      this.anchorToHead(head)
    } else {
      this.anchoredPositions = this.examples.map((example) => example.getTransform().getLocalPosition())
      this.offsets = this.stepList.map(() => vec3.zero())
    }
    const carouselPosition = head.position
      .add(head.forward.uniformScale(CAROUSEL_DISTANCE))
      .add(vec3.up().uniformScale(-(CAROUSEL_DROP + this.extraPanelDrop)))
    const transform = this.getTransform()
    transform.setWorldPosition(carouselPosition)
    // Tilted up to face the head, since it sits below eye level.
    transform.setWorldRotation(quat.lookAt(head.position.sub(carouselPosition).normalize(), vec3.up()))

    const frameObject = this.createChild(this.sceneObject, "CarouselFrame", vec3.zero())
    const frame = frameObject.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.allowTranslation = true
    frame.innerSize = new vec2(FRAME_WIDTH, FRAME_HEIGHT)
    // frame.content only exists once the Frame has initialized (on its own OnStart).
    frame.onInitialized.add(() => this.populate(frame))
  }

  private populate(frame: Frame): void {
    this.frame = frame
    frame.renderOrder = CONTENT_RENDER_ORDER - 1

    const top = FRAME_HEIGHT / 2
    // Header: title plus the minimize toggle, kept visible when the panel is collapsed.
    this.header = this.createChild(frame.content, "Header", new vec3(0, top - TITLE_HEIGHT / 2, 0))
    const titleWidth = FRAME_WIDTH - 2 * (TOGGLE_SIZE + 1)
    this.title = this.createText(this.header, "Title", new vec3(0, 0, CONTENT_Z), TITLE_SIZE, titleWidth, TITLE_HEIGHT)
    this.toggleLabel = this.createButton(
      this.header,
      "MinimizeButton",
      new vec3(FRAME_WIDTH / 2 - TOGGLE_SIZE / 2, 0, CONTENT_Z),
      "-",
      () => this.setMinimized(!this.minimized),
      TOGGLE_SIZE,
      TOGGLE_SIZE
    )

    // Body: info, counter and Previous / Next, hidden when the panel is collapsed.
    this.body = this.createChild(frame.content, "Body", vec3.zero())
    this.info = this.createText(this.body, "Info", new vec3(0, top - TITLE_HEIGHT - ROW_GAP - INFO_HEIGHT / 2, CONTENT_Z), INFO_SIZE, FRAME_WIDTH - 2, INFO_HEIGHT)
    this.info.horizontalAlignment = HorizontalAlignment.Left
    this.info.verticalAlignment = VerticalAlignment.Top
    this.info.horizontalOverflow = HorizontalOverflow.Wrap
    this.info.verticalOverflow = VerticalOverflow.Shrink
    this.counter = this.createText(this.body, "Counter", new vec3(0, -top + BUTTON_HEIGHT / 2, CONTENT_Z), COUNTER_SIZE, 8, BUTTON_HEIGHT)

    const x = FRAME_WIDTH / 2 - BUTTON_WIDTH / 2
    const y = -top + BUTTON_HEIGHT / 2
    const previous = this.createButton(this.body, "PreviousButton", new vec3(-x, y, CONTENT_Z), this.previousLabel, () => this.show(this.index - 1))
    const next = this.createButton(this.body, "NextButton", new vec3(x, y, CONTENT_Z), this.nextLabel, () => this.show(this.index + 1))

    // A single experience needs no stepping: the panel only carries its guidance.
    if (this.stepList.length < 2) {
      previous.getSceneObject().getParent().enabled = false
      next.getSceneObject().getParent().enabled = false
      this.counter.getSceneObject().enabled = false
      this.expandedHeight = SINGLE_STEP_HEIGHT
    }
    this.show(Math.min(Math.max(0, Math.floor(this.startIndex)), this.stepList.length - 1))
    this.setMinimized(this.startMinimized)
  }

  /** Builds the step list, each step's example (root), its title and the objects in between. */
  private resolveSteps(): void {
    const steps = this.steps.filter((step) => !!step)
    this.stepList = steps.length > 0 ? steps : this.examples.slice()
    this.stepRoots = this.stepList.map((step) => {
      let current: SceneObject | null = step
      let top = step
      while (current) {
        const index = this.examples.indexOf(current)
        if (index >= 0) {
          return index
        }
        top = current
        current = current.getParent()
      }
      // A step outside every listed example brings its top-level object in as an example.
      this.examples.push(top)
      return this.examples.length - 1
    })
    this.containers = []
    this.stepList.forEach((step, i) => {
      this.chainOf(step, this.examples[this.stepRoots[i]]).forEach((object) => {
        if (object !== step && this.containers.indexOf(object) < 0) {
          this.containers.push(object)
        }
      })
    })
    const perRoot: number[] = this.examples.map(() => 0)
    this.stepTitles = this.stepList.map((step, i) => {
      const rootIndex = this.stepRoots[i]
      const root = this.examples[rootIndex]
      const total = this.stepRoots.filter((r) => r === rootIndex).length
      perRoot[rootIndex] += 1
      if (step === root || total < 2) {
        return this.displayName(root.name)
      }
      const number = perRoot[rootIndex] < 10 ? "0" + perRoot[rootIndex] : "" + perRoot[rootIndex]
      return this.displayName(root.name) + " " + number + " · " + this.displayName(step.name)
    })
    // Two sub-examples with the same name get "2", "3", ... so their titles differ.
    const seen: {[title: string]: number} = {}
    this.stepTitles = this.stepTitles.map((title) => {
      const key = title.replace(/ \d\d · /, " · ")
      seen[key] = (seen[key] || 0) + 1
      return seen[key] > 1 ? title + " " + seen[key] : title
    })
  }

  /** The step and its parents up to (and including) its example root. */
  private chainOf(step: SceneObject, root: SceneObject): SceneObject[] {
    const chain: SceneObject[] = []
    let current: SceneObject | null = step
    while (current) {
      chain.push(current)
      if (current === root) {
        break
      }
      current = current.getParent()
    }
    return chain
  }

  /** Collapses the panel to its title bar, or expands it back. */
  private setMinimized(minimized: boolean): void {
    if (!this.frame || !this.header || !this.body) {
      return
    }
    this.minimized = minimized
    this.body.enabled = !minimized
    const height = minimized ? TITLE_HEIGHT : this.expandedHeight
    this.header.getTransform().setLocalPosition(new vec3(0, height / 2 - TITLE_HEIGHT / 2, 0))
    // The body is laid out for the full panel; keep its info row right under the header.
    this.body.getTransform().setLocalPosition(new vec3(0, height / 2 - FRAME_HEIGHT / 2, 0))
    // Resize without scaling the content, then treat the new size as the 1x baseline.
    this.frame.autoScaleContent = false
    this.frame.innerSize = new vec2(FRAME_WIDTH, height)
    this.frame.syncScaleBaseline()
    this.frame.autoScaleContent = true
    if (this.toggleLabel) {
      this.toggleLabel.text = minimized ? "+" : "-"
    }
  }

  /** Head position plus its heading on the ground plane; `facing` turns content toward the user. */
  private headPose(): HeadPose {
    const camera = WorldCameraFinderProvider.getInstance()
    const position = camera.getWorldPosition()
    let forward = camera.getForwardPositionParallelToGround(1).sub(position)
    forward = forward.length > 0.0001 ? forward.normalize() : new vec3(0, 0, -1)
    return {position, forward, facing: quat.lookAt(forward.uniformScale(-1), vec3.up())}
  }

  /** Moves the examples from the scene origin to the head pose, keeping their authored layout. */
  private anchorToHead(head: HeadPose): void {
    const anchor = global.scene.createSceneObject("ExamplesAnchor")
    const anchorTransform = anchor.getTransform()
    anchorTransform.setWorldPosition(
      head.position.add(head.forward.uniformScale(this.examplesPushBack))
    )
    anchorTransform.setWorldRotation(head.facing)
    // Read every pose before moving any example: an example nested inside another one would
    // otherwise be read after its parent moved, and get the lift and push-back twice.
    const poses = this.examples.map((example) => {
      const transform = example.getTransform()
      return {position: transform.getWorldPosition(), rotation: transform.getWorldRotation(), scale: transform.getWorldScale()}
    })
    this.examples.forEach((example, i) => {
      const transform = example.getTransform()
      example.setParent(anchor)
      transform.setLocalPosition(poses[i].position)
      transform.setLocalRotation(poses[i].rotation)
      transform.setLocalScale(poses[i].scale)
    })
    this.anchoredPositions = this.examples.map((example) => example.getTransform().getLocalPosition())
    this.offsets = this.stepList.map(() => null)
  }

  private show(index: number): void {
    const count = this.stepList.length
    this.index = ((index % count) + count) % count
    const step = this.stepList[this.index]
    const rootIndex = this.stepRoots[this.index]
    const root = this.examples[rootIndex]
    const chain = this.chainOf(step, root)
    this.stepList.forEach((other) => {
      if (other !== step && chain.indexOf(other) < 0) {
        other.enabled = false
      }
    })
    this.containers.forEach((container) => {
      if (chain.indexOf(container) < 0) {
        container.enabled = false
      }
    })
    this.examples.forEach((example) => {
      if (example !== root) {
        example.enabled = false
      }
    })
    // Parents first, then the step; the root is enabled (and placed) by placeExample.
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i] !== root) {
        chain[i].enabled = true
      }
    }
    this.placeExample(this.index)
    if (this.title) {
      this.title.text = this.stepTitles[this.index]
    }
    if (this.info) {
      const stepInfo = this.steps.length > 0 ? (this.stepInfo[this.index] || "").trim() : ""
      this.info.text = stepInfo.length > 0 ? stepInfo : this.infos[rootIndex]
    }
    if (this.counter) {
      this.counter.text = this.index + 1 + " / " + count
    }
  }

  /**
   * Shows the example at its anchored place, pushed back so none of it is in front of the carousel.
   * The first time, the push isn't known yet: the example is enabled out of view behind the user,
   * measured once its content exists, then moved into place, so it never appears and then jumps.
   */
  private placeExample(i: number): void {
    const rootIndex = this.stepRoots[i]
    const example = this.examples[rootIndex]
    const transform = example.getTransform()
    transform.setLocalPosition(this.anchoredPositions[rootIndex])
    const head = this.head
    const knownOffset = this.offsets[i]
    if (!head || knownOffset !== null) {
      if (head && knownOffset) {
        transform.setWorldPosition(transform.getWorldPosition().add(knownOffset))
      }
      example.enabled = true
      return
    }
    const anchoredWorld = transform.getWorldPosition()
    transform.setWorldPosition(anchoredWorld.add(head.forward.uniformScale(-MEASURE_HIDE_DISTANCE)))
    example.enabled = true
    const delay = this.createEvent("DelayedCallbackEvent")
    delay.bind(() => {
      if (!example.enabled || this.index !== i) {
        transform.setLocalPosition(this.anchoredPositions[rootIndex])
        return
      }
      const bounds = this.measure(example, head)
      let offset = vec3.zero()
      if (bounds) {
        const nearest = bounds.nearest + MEASURE_HIDE_DISTANCE
        const push =
          nearest < EXAMPLE_NEAR_DISTANCE || nearest > EXAMPLE_FAR_DISTANCE ? EXAMPLE_NEAR_DISTANCE - nearest : 0
        offset = head.forward.uniformScale(push).add(vec3.up().uniformScale(-EXAMPLE_EYE_DROP - bounds.centerHeight))
      }
      this.offsets[i] = offset
      transform.setWorldPosition(anchoredWorld.add(offset))
    })
    delay.reset(MEASURE_DELAY)
  }

  /**
   * Bounds of the visible meshes and text under `root`, relative to the head: the smallest distance along
   * the head's forward, and the height of the vertical centre above eye level. Null when nothing is visible.
   */
  private measure(root: SceneObject, head: HeadPose): {nearest: number; centerHeight: number} | null {
    let nearest = Number.POSITIVE_INFINITY
    let minHeight = Number.POSITIVE_INFINITY
    let maxHeight = Number.NEGATIVE_INFINITY
    const visit = (object: SceneObject) => {
      if (!object.enabled) {
        return
      }
      object.getComponents("Component.BaseMeshVisual").forEach((visual) => {
        if (!visual.enabled) {
          return
        }
        const min = visual.worldAabbMin()
        const max = visual.worldAabbMax()
        // A visual whose mesh isn't built yet (e.g. a code-built UIKit ScrollBar in its first
        // frames) reports an empty box at an arbitrary point, which would push the example
        // kilometres away. Skip empty boxes and anything implausibly far from the head.
        if (!this.isMeasurable(min, max, head)) {
          return
        }
        for (let i = 0; i < 8; i++) {
          const corner = new vec3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z)
          const fromHead = corner.sub(head.position)
          nearest = Math.min(nearest, fromHead.dot(head.forward))
          minHeight = Math.min(minHeight, fromHead.y)
          maxHeight = Math.max(maxHeight, fromHead.y)
        }
      })
      for (let i = 0; i < object.getChildrenCount(); i++) {
        visit(object.getChild(i))
      }
    }
    visit(root)
    if (!Number.isFinite(nearest)) {
      return null
    }
    return {nearest, centerHeight: (minHeight + maxHeight) / 2}
  }

  /** Whether a visual's world bounds are a real, finite box within reach of the head. */
  private isMeasurable(min: vec3, max: vec3, head: HeadPose): boolean {
    const values = [min.x, min.y, min.z, max.x, max.y, max.z]
    if (values.some((value) => !Number.isFinite(value))) {
      return false
    }
    if (max.x - min.x <= 0 && max.y - min.y <= 0 && max.z - min.z <= 0) {
      return false
    }
    return min.distance(head.position) <= MEASURE_MAX_RANGE && max.distance(head.position) <= MEASURE_MAX_RANGE
  }

  /** Hides the example's guides and instruction labels, and returns their text joined ("" if none). */
  private takeGuideText(example: SceneObject): string {
    const guides: SceneObject[] = []
    this.collectGuides(example, guides)
    const texts: string[] = []
    guides.forEach((guide) => {
      guide.enabled = false
      const text = this.findText(guide)
      const value = text ? text.text.trim() : ""
      if (value.length > 0 && texts.indexOf(value) < 0) {
        texts.push(value)
      }
    })
    return texts.join("\n\n")
  }

  private collectGuides(root: SceneObject, guides: SceneObject[]): void {
    for (let i = 0; i < root.getChildrenCount(); i++) {
      const child = root.getChild(i)
      if (this.isGuide(child)) {
        guides.push(child)
      } else {
        this.collectGuides(child, guides)
      }
    }
  }

  private isGuide(object: SceneObject): boolean {
    if (object.name.toLowerCase().replace("reada", "read") === EXAMPLE_GUIDE_NAME) {
      return true
    }
    if (object.getComponent(GuideDismissPanel.getTypeName())) {
      return true
    }
    // Packages mark instruction text with a blue label background.
    const text = object.getComponent("Component.Text")
    if (!text || !text.backgroundSettings.enabled) {
      return false
    }
    const color = text.backgroundSettings.fill.color
    return color.z > 0.9 && color.x < 0.1 && color.y < 0.3
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

  /** "[DetectASharpTurnMovement-Check logs]" -> "Detect A Sharp Turn Movement", "SIKExamples" -> "SIK Examples". */
  private displayName(name: string): string {
    const bracketed = /\[([^\]]+)\]\s*$/.exec(name.replace(/"/g, ""))
    const base = (bracketed ? bracketed[1] : name.replace(/"/g, ""))
      .replace(/__PLACE_IN_SCENE/gi, "")
      .replace(/^\[EXAMPLES\]\s*/i, "")
      .split("-")[0]
    const cleaned = base
      .replace(/_+/g, " ")
      // Script-language suffixes read as words: "AccessTSfromJS" -> "Access TS from JS".
      .replace(/(TS|JS)/g, " $1 ")
      .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      // Keep "2D" / "3D" together.
      .replace(/(\d) D\b/g, "$1D")
      // Keep "ARKit" together.
      .replace(/\bAR Kit\b/g, "ARKit")
      // Keep product names together: "OpenAI", "DeepSeek".
      .replace(/\bOpen AI\b/g, "OpenAI")
      .replace(/\bDeep Seek\b/g, "DeepSeek")
      .replace(/\s+/g, " ")
      .trim()
    return cleaned.length > 0 ? cleaned : name
  }

  private createButton(
    parent: SceneObject,
    name: string,
    position: vec3,
    label: string,
    onPress: () => void,
    width: number = BUTTON_WIDTH,
    height: number = BUTTON_HEIGHT
  ): Text {
    const buttonObject = this.createChild(parent, name, position)
    const button = buttonObject.createComponent(RectangleButton.getTypeName()) as RectangleButton
    button.size = new vec3(width, height, 1)
    button.renderOrder = CONTENT_RENDER_ORDER
    button.initialize()
    const text = this.createText(buttonObject, "Label", new vec3(0, 0, LABEL_Z), LABEL_SIZE, width, height)
    text.text = label
    button.onTriggerUp.add(onPress)
    return text
  }

  private createText(parent: SceneObject, name: string, position: vec3, size: number, width: number, height: number): Text {
    const textObject = this.createChild(parent, name, position)
    const text = textObject.createComponent("Component.Text")
    text.size = size
    text.textFill.color = new vec4(1, 1, 1, 1)
    text.horizontalAlignment = HorizontalAlignment.Center
    text.verticalAlignment = VerticalAlignment.Center
    text.horizontalOverflow = HorizontalOverflow.Shrink
    text.layoutRect = Rect.create(-width / 2, width / 2, -height / 2, height / 2)
    text.depthTest = true
    text.renderOrder = CONTENT_RENDER_ORDER + 2
    return text
  }

  private createChild(parent: SceneObject, name: string, position: vec3): SceneObject {
    const child = global.scene.createSceneObject(name)
    child.setParent(parent)
    child.getTransform().setLocalPosition(position)
    return child
  }
}
