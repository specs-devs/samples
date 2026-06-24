/**
 * Specs Inc. 2026
 * Secondary UIController for the AI Music Gen Spectacles lens experience.
 */
import {GenresData} from "Data/GenresData"
import {InstrumentsData} from "Data/InstrumentsData"
import {VibesData} from "Data/VibesData"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import {RectangleButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton"
import {RoundButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton"
import {ScrollWindow} from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {MathUtils} from "Utilities.lspkg/Scripts/Utils/MathUtils"
import {Adder} from "./Adder"
import {SelectionController} from "./SelectionController"

@component
export class SecondaryUIController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Secondary UI Controller – category browsing interface</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages Genres, Vibes, and Instruments scroll categories with reusable Adder items.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Pages</span>')
  @input
  @hint("SceneObject containing the main page UI")
  private _mainPage: SceneObject

  @input
  @hint("SceneObject containing the category details page UI")
  private _detailsPage: SceneObject

  @ui.label('<span style="color: #60A5FA;">Scroll</span>')
  @input
  @hint("Prefab used to instantiate Adder buttons for each category item")
  private _adderPrefab: ObjectPrefab

  @input
  @hint("ScrollWindow component for the category item grid")
  private _scrollWindow: ScrollWindow

  @ui.label('<span style="color: #60A5FA;">Controls</span>')
  @input
  @hint("Buttons that switch between categories (Genres, Vibes, Instruments)")
  private _categoryButtons: RectangleButton[]

  @input
  @hint("Parent SceneObject used for positioning Adder instances")
  private _instrumentObj: SceneObject

  @input
  @hint("Button that repositions the UI panel in front of the user")
  private _summonButton: RoundButton

  @input
  @hint("Hint text shown before the summon button is pressed")
  private _hintText: Text

  @input
  @hint("Root SceneObject for the entire secondary UI panel")
  private _parentObj: SceneObject

  @input
  @hint("SelectionController that receives items when an Adder is pressed")
  private _selectionController: SelectionController

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private _vibesScrollDimensions: vec2
  private _genresScrollDimensions: vec2
  private _instrumentsScrollDimensions: vec2

  // Store all data
  private _vibesData: string[]
  private _vibesEmojis: string[]
  private _genresData: string[]
  private _genresEmojis: string[]
  private _instrumentsData: string[]
  private _instrumentsEmojis: string[]

  // Store created adders
  private _adders: SceneObject[] = []
  private _currentCategory: string = ""
  private _itemSpacing: number = 5
  private _rowSpacing: number = 8
  private _initialOffset: number = 2

  onAwake() {
    this.logger = new Logger("SecondaryUIController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this._scrollWindow.initialize()
    this.initializeScrolls()
    this._categoryButtons.forEach((button) => {
      button.onInitialized.add(() => {
        button.onTriggerUp.add((event) => {
          this.logger.debug(button.getSceneObject().name)
          const title = button.getSceneObject().getChild(0).getComponent("Text").text
          this.openDetailsPage(title)
        })
      })
    })
    this.openMainPage()
    this.selectScrollCategory("Genres")
    this._summonButton.onInitialized.add(() => {
      this._summonButton.onTriggerUp.add(() => {
        // Scale out hint text over 0.25s
        const hintTr = this._hintText.getSceneObject().getTransform()
        const baseScale = hintTr.getLocalScale()
        animate({
          duration: 0.25,
          easing: "ease-in-back-cubic",
          update: (t: number) => {
            const k = 1 - t
            hintTr.setLocalScale(baseScale.uniformScale(Math.max(0, k)))
          }
        })
        const posInFrontOfUser = WorldCameraFinderProvider.getInstance().getForwardPosition(100)
        const parentTransform = this._parentObj.getTransform()
        const currPosition = parentTransform.getWorldPosition()
        const distance = posInFrontOfUser.distance(currPosition)
        if (distance > 500) {
          parentTransform.setWorldPosition(posInFrontOfUser.add(vec3.down().uniformScale(80)))
        }
        // Move to target over 0.5s with ease-out-back-cubic-like curve
        const from = parentTransform.getWorldPosition()
        const to = posInFrontOfUser
        animate({
          duration: 0.5,
          easing: "ease-out-back-cubic",
          update: (t: number) => {
            const nx = MathUtils.lerp(from.x, to.x, t)
            const ny = MathUtils.lerp(from.y, to.y, t)
            const nz = MathUtils.lerp(from.z, to.z, t)
            parentTransform.setWorldPosition(new vec3(nx, ny, nz))
          }
        })
      })
    })
  }

  initializeScrolls() {
    // Load all data
    this._vibesData = new VibesData().vibes
    this._vibesEmojis = new VibesData().emojis
    this._genresData = new GenresData().genres
    this._genresEmojis = new GenresData().emojis
    this._instrumentsData = new InstrumentsData().instruments
    this._instrumentsEmojis = new InstrumentsData().emojis

    // Calculate maximum number of items needed across all categories
    const maxItems = Math.max(this._vibesData.length, this._genresData.length, this._instrumentsData.length)

    // Calculate scroll dimensions for each category
    const vibesItemsPerRow = Math.ceil(this._vibesData.length / 2)
    const genresItemsPerRow = Math.ceil(this._genresData.length / 2)
    const instrumentsItemsPerRow = Math.ceil(this._instrumentsData.length / 2)

    const vibesWidth = Math.max(
      this._scrollWindow.scrollDimensions.x,
      vibesItemsPerRow * this._itemSpacing + this._initialOffset
    )

    const genresWidth = Math.max(
      this._scrollWindow.scrollDimensions.x,
      genresItemsPerRow * this._itemSpacing + this._initialOffset
    )

    const instrumentsWidth = Math.max(
      this._scrollWindow.scrollDimensions.x,
      instrumentsItemsPerRow * this._itemSpacing + this._initialOffset
    )

    // Store scroll dimensions for each category
    const scrollHeight = this._scrollWindow.scrollDimensions.y
    this._vibesScrollDimensions = new vec2(vibesWidth, scrollHeight)
    this._genresScrollDimensions = new vec2(genresWidth, scrollHeight)
    this._instrumentsScrollDimensions = new vec2(instrumentsWidth, scrollHeight)

    // Create a single set of adders that will be reused
    // We'll parent them to the current scene object for now and reparent when needed
    for (let i = 0; i < maxItems; i++) {
      const adder = this._adderPrefab.instantiate(this._instrumentObj)
      const adderComponent = adder.getComponent(Adder.getTypeName())
      adderComponent.addSelectionController(this._selectionController)
      this._adders.push(adder)
      adder.enabled = false // Initially disable all adders
    }
  }

  openMainPage() {
    this._mainPage.enabled = true
  }

  openDetailsPage(title: string) {
    this._scrollWindow.scrollPositionNormalized = new vec2(-1, 0)
    //this._mainPage.enabled = false;
    this._detailsPage.enabled = true
    this.selectScrollCategory(title)
    //this._scrollWindow.scrollPositionNormalized = new vec2(-1, 0);
  }

  selectScrollCategory(category: string) {
    if (this._currentCategory === category) return
    this._currentCategory = category

    // Update scroll dimensions based on the selected category
    if (category === "Vibes") {
      this._scrollWindow.scrollDimensions = this._vibesScrollDimensions
      this._updateAdders(this._vibesData, this._vibesEmojis, Math.ceil(this._vibesData.length / 2))
    } else if (category === "Genres") {
      this._scrollWindow.scrollDimensions = this._genresScrollDimensions
      this._updateAdders(this._genresData, this._genresEmojis, Math.ceil(this._genresData.length / 2))
    } else if (category === "Instruments") {
      this._scrollWindow.scrollDimensions = this._instrumentsScrollDimensions
      this._updateAdders(this._instrumentsData, this._instrumentsEmojis, Math.ceil(this._instrumentsData.length / 2))
    }
  }

  private _updateAdders(data: string[], emojis: string[], itemsPerRow: number) {
    // First disable all adders
    this._adders.forEach((adder) => (adder.enabled = false))

    // Get width for this category
    const width = Math.max(this._scrollWindow.scrollDimensions.x, itemsPerRow * this._itemSpacing + this._initialOffset)

    // Update and position only the adders we need for this category
    for (let i = 0; i < data.length; i++) {
      if (i >= this._adders.length) break

      const adder = this._adders[i]
      adder.enabled = true

      const row = Math.floor(i / itemsPerRow)
      const col = i % itemsPerRow

      adder
        .getTransform()
        .setLocalPosition(
          new vec3(col * this._itemSpacing - width / 2 + this._initialOffset, -1 - row * this._rowSpacing, 0)
        )

      const adderComponent = adder.getComponent(Adder.getTypeName())
      adderComponent.init(data[i], emojis[i])
    }
  }
}
