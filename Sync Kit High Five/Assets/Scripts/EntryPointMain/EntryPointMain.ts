/**
 * Specs Inc. 2026
 * Entry Point Main component for the High Five Spectacles lens.
 */
import {SessionController} from "SpectaclesSyncKit.lspkg/Core/SessionController"
import {HandSynchronization} from "../HighFiveControls/HandSynchronization/HandSynchronization"
import {HandSynchronizationInput} from "../HighFiveControls/HandSynchronization/HandSynchronizationInput"
import {HighFiveController} from "../HighFiveControls/HighFiveController/HighFiveController"
import {HighFiveControllerInput} from "../HighFiveControls/HighFiveController/HighFiveControllerInput"
import {DataSynchronizationController} from "../HighFiveControls/SyncControls/DataSynchronizationController"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class EntryPointMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">EntryPointMain – High Five main entry point</span><br/><span style="color: #94A3B8; font-size: 11px;">Initializes and coordinates hand sync, high-five detection, and data synchronization.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Inputs</span>')
  @input
  @hint("Input configuration for hand synchronization")
  readonly handSynchronizationInput: HandSynchronizationInput

  @input
  @hint("Input configuration for high-five controller")
  readonly highFiveControllerInput: HighFiveControllerInput

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  private handSynchronization: HandSynchronization

  private highFiveController: HighFiveController

  private dataSynchronizationController: DataSynchronizationController

  onAwake() {
    this.logger = new Logger("EntryPointMain", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.handSynchronization = new HandSynchronization(this.handSynchronizationInput)

    this.highFiveController = new HighFiveController(this.highFiveControllerInput)

    this.dataSynchronizationController = new DataSynchronizationController(
      this.handSynchronization,
      this.highFiveController
    )

    SessionController.getInstance().notifyOnStartColocated(() => {
      this.onStart()
    })
  }

  private onStart() {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.handSynchronization.start()
    this.highFiveController.start()
    this.dataSynchronizationController.start()
  }
}
