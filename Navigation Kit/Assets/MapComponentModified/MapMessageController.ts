import {ContainerFrame} from "SpectaclesInteractionKit.lspkg/Components/UI/ContainerFrame/ContainerFrame"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {MapComponent} from "./Scripts/MapComponent"

@component
export class MapMessageController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  private mapComponent: MapComponent
  @input
  private container: ContainerFrame
  @input
  private textComponent: Text
  @input
  private renderOrder: number

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake() {
    this.logger = new Logger("MapMessageController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.container.renderOrder = this.renderOrder
    this.container.closeButton.onTrigger.add(() => this.handleCloseButtonTriggered())
    this.mapComponent.subscribeOnNoNearbyPlacesFound(() => this.showMessage("No nearby places found"))

    this.mapComponent.subscribeOnNearbyPlacesFailed(() =>
      this.showMessage("Failed to received nearby places. Please check your internet connection.")
    )

    this.handleCloseButtonTriggered()
  }

  showMessage(message: string) {
    this.container.sceneObject.enabled = true
    this.textComponent.text = message
  }

  private handleCloseButtonTriggered() {
    this.container.sceneObject.enabled = false
    this.textComponent.text = ""
  }
}
