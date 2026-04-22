import {GridLayout} from "SpectaclesUIKit.lspkg/Scripts/Components/GridLayout/GridLayout"
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {ScrollWindow} from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow"
import {ExperimentalMapboxHints, HintsUpdate, DirectionStep} from "./ExperimentalMapboxHints"

const TAG = "[ExperimentalMapboxHintsUI]"

// ─── Layout ───────────────────────────────────────────────────────────────────
const BUTTON_WIDTH = 14       // grid cell width (controls layout)
const BUTTON_INNER_W = 20     // button.size x — the inner visual width of the card
const BUTTON_HEIGHT = 5
const BUTTON_DEPTH = 1
const BUTTON_STYLE = "PrimaryNeutral"
const GRID_SPACING = 0.5
const VISIBLE_ROWS = 2

// Window shows exactly 2 rows
const WINDOW_W = BUTTON_INNER_W + GRID_SPACING * 4
const WINDOW_H = VISIBLE_ROWS * (BUTTON_HEIGHT + GRID_SPACING * 4)

const TITLE_FONT_SIZE = 36
const SUBTITLE_FONT_SIZE = 26
const STATUS_FONT_SIZE = 34
const TEXT_HALF_W = 15   // layout rect: -15 to +15
const TEXT_HALF_H = 2.25 // layout rect: -2.25 to +2.25
const Z_OFFSET = 0.5

// ─── Colors ───────────────────────────────────────────────────────────────────
const COLOR_CURRENT = new vec4(0.3, 0.85, 0.5, 1)  // accent green – current step
const COLOR_DEFAULT = new vec4(1, 1, 1, 1)           // white – upcoming steps
const COLOR_DIM = new vec4(0.6, 0.6, 0.6, 1)         // grey – distances / subtitles
const COLOR_ARRIVED = new vec4(0.3, 0.85, 0.5, 1)

/**
 * Scroll UI for Mapbox turn-by-turn hints.
 * Shows 2 direction steps at a time; scrollable for the rest.
 * Always scrolled to the top (current step first) when route updates.
 *
 * Wire-up in Lens Studio inspector:
 *  • hintsComponent – reference to the ExperimentalMapboxHints script on its SceneObject
 *
 * This SceneObject is hidden by default and shown automatically when navigation starts.
 */
@component
export class ExperimentalMapboxHintsUI extends BaseScriptComponent {
  @input
  @hint("ExperimentalMapboxHints data component")
  private hintsComponent: ExperimentalMapboxHints

  // ─── Live scroll objects ─────────────────────────────────────────────────

  private scrollWindowObject: SceneObject | null = null
  private scrollWindow: ScrollWindow | null = null
  private gridContainer: SceneObject | null = null
  private gridLayout: GridLayout | null = null

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  private onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.start())
  }

  private start(): void {
    if (isNull(this.hintsComponent)) {
      print(TAG + " ERROR: hintsComponent not wired in inspector")
      return
    }

    // Hidden until navigation is active
    this.sceneObject.enabled = false

    this.hintsComponent.onNavigationActive.add((active) => {
      this.sceneObject.enabled = active
      if (!active) this.clear()
    })

    this.hintsComponent.onHintsChanged.add((update) => {
      this.rebuild(update)
    })

    print(TAG + " initialized – waiting for hints data")
  }

  // ─── Rebuild ────────────────────────────────────────────────────────────

  private rebuild(update: HintsUpdate): void {
    this.clear()

    // Arrival state
    if (update.isArrived) {
      this.buildSingleMessage("✓ Arrived at " + update.arrivedPlaceName, COLOR_ARRIVED)
      return
    }

    // Loading / error state
    if (update.statusMessage !== "") {
      this.buildSingleMessage(update.statusMessage, COLOR_DIM)
      return
    }

    if (update.steps.length === 0) return

    // ── Scroll window ──────────────────────────────────────────────────
    const rowCount = update.steps.length
    const contentW = BUTTON_INNER_W + GRID_SPACING * 2
    const contentH = rowCount * (BUTTON_HEIGHT + GRID_SPACING * 2)

    this.scrollWindowObject = global.scene.createSceneObject("HintsScrollWindow")
    this.scrollWindowObject.setParent(this.sceneObject)

    this.scrollWindow = this.scrollWindowObject.createComponent(
      ScrollWindow.getTypeName()
    ) as ScrollWindow
    ;(this.scrollWindow as any)._vertical = true
    ;(this.scrollWindow as any)._horizontal = false
    ;(this.scrollWindow as any)._windowSize = new vec2(WINDOW_W, WINDOW_H)
    ;(this.scrollWindow as any)._scrollDimensions = new vec2(contentW, contentH)

    this.gridContainer = global.scene.createSceneObject("HintsGrid")
    this.gridContainer.setParent(this.scrollWindowObject)

    this.gridLayout = this.gridContainer.createComponent(
      GridLayout.getTypeName()
    ) as GridLayout
    this.gridLayout.rows = rowCount
    this.gridLayout.columns = 1
    this.gridLayout.cellSize = new vec2(BUTTON_WIDTH, BUTTON_HEIGHT)
    this.gridLayout.cellPadding = new vec4(GRID_SPACING, GRID_SPACING, GRID_SPACING, GRID_SPACING)
    this.gridLayout.layoutBy = 0

    // ── Step rows ──────────────────────────────────────────────────────
    for (let i = 0; i < update.steps.length; i++) {
      const step = update.steps[i]
      const isCurrent = i === 0
      const titleColor = isCurrent ? COLOR_CURRENT : COLOR_DEFAULT
      const subtitle = step.distanceMeters > 0 ? this.formatDistance(step.distanceMeters) : ""
      this.createStepRow(step.instruction, subtitle, titleColor)
    }

    this.gridLayout.initialize()

    this.scrollWindow.initialize()
    // Always show the current (first) step at the top
    this.scrollWindow.scrollPositionNormalized = new vec2(0, 1)

    this.applyZOffset()

    const summary =
      this.formatDistance(update.totalDistanceMeters) +
      "  ·  ~" +
      this.formatDuration(update.totalDurationSeconds)
    print(TAG + " route displayed – " + rowCount + " steps, " + summary)
  }

  // ─── Row builders ────────────────────────────────────────────────────────

  /**
   * Creates one RectangleButton card inside the grid for a direction step.
   */
  private createStepRow(title: string, subtitle: string, titleColor: vec4): void {
    const btnObj = global.scene.createSceneObject(title.substring(0, 24))
    btnObj.setParent(this.gridContainer)

    const button = btnObj.createComponent(
      RectangleButton.getTypeName()
    ) as RectangleButton
    ;(button as any)._style = BUTTON_STYLE
    button.size = new vec3(BUTTON_INNER_W, BUTTON_HEIGHT, BUTTON_DEPTH)
    button.initialize()
    button.hasShadow = true

    const contentObj = global.scene.createSceneObject("Content")
    contentObj.setParent(btnObj)
    contentObj.getTransform().setLocalPosition(new vec3(0, 0.6, 0.1))

    const titleObj = global.scene.createSceneObject("Title")
    titleObj.setParent(contentObj)
    const titleText = titleObj.createComponent("Component.Text") as Text
    titleText.size = TITLE_FONT_SIZE
    titleText.text = title
    titleText.textFill.color = titleColor
    titleText.horizontalAlignment = HorizontalAlignment.Center
    titleText.verticalAlignment = VerticalAlignment.Center
    titleText.worldSpaceRect = Rect.create(-TEXT_HALF_W, TEXT_HALF_W, -TEXT_HALF_H, TEXT_HALF_H)

    if (subtitle !== "") {
      const subObj = global.scene.createSceneObject("Subtitle")
      subObj.setParent(contentObj)
      subObj.getTransform().setLocalPosition(new vec3(0, -1.4, 0))
      const subText = subObj.createComponent("Component.Text") as Text
      subText.size = SUBTITLE_FONT_SIZE
      subText.text = subtitle
      subText.textFill.color = COLOR_DIM
      subText.horizontalAlignment = HorizontalAlignment.Center
      subText.verticalAlignment = VerticalAlignment.Center
      subText.worldSpaceRect = Rect.create(-TEXT_HALF_W, TEXT_HALF_W, -TEXT_HALF_H, TEXT_HALF_H)
    }
  }

  /**
   * Single centered text line for status / arrival messages (no scroll).
   */
  private buildSingleMessage(message: string, color: vec4): void {
    const obj = global.scene.createSceneObject("HintsMessage")
    obj.setParent(this.sceneObject)
    const t = obj.createComponent("Component.Text") as Text
    t.size = STATUS_FONT_SIZE
    t.text = message
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.worldSpaceRect = Rect.create(-TEXT_HALF_W, TEXT_HALF_W, -TEXT_HALF_H, TEXT_HALF_H)
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private applyZOffset(): void {
    if (!this.gridContainer) return
    for (let i = 0; i < this.gridContainer.getChildrenCount(); i++) {
      const child = this.gridContainer.getChild(i)
      const pos = child.getTransform().getLocalPosition()
      child.getTransform().setLocalPosition(new vec3(pos.x, pos.y, Z_OFFSET))
    }
  }

  private clear(): void {
    this.scrollWindowObject = null
    this.scrollWindow = null
    this.gridContainer = null
    this.gridLayout = null
    // Destroy all child scene objects (scroll window + any status text)
    for (let i = this.sceneObject.getChildrenCount() - 1; i >= 0; i--) {
      this.sceneObject.getChild(i).destroy()
    }
  }

  private formatDistance(meters: number): string {
    if (meters < 1000) return Math.round(meters) + "m"
    return (meters / 1000).toFixed(1) + "km"
  }

  private formatDuration(seconds: number): string {
    const mins = Math.round(seconds / 60)
    if (mins < 60) return mins + " min"
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? h + "h " + m + "min" : h + "h"
  }
}
