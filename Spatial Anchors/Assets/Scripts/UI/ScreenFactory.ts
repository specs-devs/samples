import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {EventBus} from "../Shared/EventBus"
import {AppScreen, UIController} from "./UIController"
import {GetStartedScreen} from "./Screens/GetStartedScreen"
import {CaptureScreen} from "./Screens/CaptureScreen"
import {InCaptureScreen} from "./Screens/InCaptureScreen"
import {MyAreasScreen} from "./Screens/MyAreasScreen"
import {InAreaScreen} from "./Screens/InAreaScreen"
import {AreaInfo} from "./Components/AreaGridBuilder"

/**
 * Orchestrates construction of all 5 screens.
 * Builds each screen's UI inside the container provided by UIController
 * and exposes per-screen accessors for runtime updates (e.g. area data refresh).
 */
export class ScreenFactory {
  private eventBus: EventBus
  private logger: Logger
  private uiController: UIController

  private getStartedScreen: GetStartedScreen
  private captureScreen: CaptureScreen
  private inCaptureScreen: InCaptureScreen
  private myAreasScreen: MyAreasScreen
  private inAreaScreen: InAreaScreen

  constructor(uiController: UIController, eventBus: EventBus, logger: Logger) {
    this.uiController = uiController
    this.eventBus = eventBus
    this.logger = logger
  }

  /** Build all screens into the UIController's screen containers. */
  buildAllScreens(): void {
    this.buildGetStarted()
    this.buildCapture()
    this.buildInCapture()
    this.buildMyAreas()
    this.buildInArea()
    this.logger.debug("All 5 screens built")
  }

  // ── Screen accessors for runtime updates ───────────────

  getGetStartedScreen(): GetStartedScreen {
    return this.getStartedScreen
  }

  getCaptureScreen(): CaptureScreen {
    return this.captureScreen
  }

  getInCaptureScreen(): InCaptureScreen {
    return this.inCaptureScreen
  }

  getMyAreasScreen(): MyAreasScreen {
    return this.myAreasScreen
  }

  getInAreaScreen(): InAreaScreen {
    return this.inAreaScreen
  }

  /** Convenience: update My Areas grid with current area data. */
  refreshMyAreas(areas: AreaInfo[]): void {
    if (this.myAreasScreen) {
      this.myAreasScreen.updateAreas(areas)
    }
  }

  /** Convenience: update In-Capture status text. */
  setCaptureStatus(text: string): void {
    if (this.inCaptureScreen) {
      this.inCaptureScreen.setStatusText(text)
    }
  }

  /** Convenience: update Minimize/Release button label on InArea screen. */
  setRecallActive(active: boolean): void {
    if (this.inAreaScreen) {
      this.inAreaScreen.setRecallActive(active)
    }
  }

  /** Convenience: update Surface Snap button label on InArea screen. */
  setSnapActive(active: boolean): void {
    if (this.inAreaScreen) {
      this.inAreaScreen.setSnapActive(active)
    }
  }

  /** Convenience: update localization status text on InArea screen. */
  setLocalizationStatus(text: string): void {
    if (this.inAreaScreen) {
      this.inAreaScreen.setLocalizationStatus(text)
    }
  }

  // ── Internal builders ──────────────────────────────────

  private buildGetStarted(): void {
    const container = this.uiController.getScreenContainer(AppScreen.GetStarted)
    if (!container) {
      this.logger.error("No container for GetStarted screen")
      return
    }
    this.getStartedScreen = new GetStartedScreen(container, this.eventBus, this.logger)
  }

  private buildCapture(): void {
    const container = this.uiController.getScreenContainer(AppScreen.Capture)
    if (!container) {
      this.logger.error("No container for Capture screen")
      return
    }
    this.captureScreen = new CaptureScreen(container, this.eventBus, this.logger)
  }

  private buildInCapture(): void {
    const container = this.uiController.getScreenContainer(AppScreen.InCapture)
    if (!container) {
      this.logger.error("No container for InCapture screen")
      return
    }
    this.inCaptureScreen = new InCaptureScreen(container, this.eventBus, this.logger)
  }

  private buildMyAreas(): void {
    const container = this.uiController.getScreenContainer(AppScreen.MyAreas)
    if (!container) {
      this.logger.error("No container for MyAreas screen")
      return
    }
    this.myAreasScreen = new MyAreasScreen(container, this.eventBus, this.logger)
  }

  private buildInArea(): void {
    const container = this.uiController.getScreenContainer(AppScreen.InArea)
    if (!container) {
      this.logger.error("No container for InArea screen")
      return
    }
    this.inAreaScreen = new InAreaScreen(container, this.eventBus, this.logger)
  }
}
