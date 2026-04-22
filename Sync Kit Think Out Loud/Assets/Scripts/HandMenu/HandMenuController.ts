/**
 * Specs Inc. 2026
 * Hand Menu Controller for the Think Out Loud Spectacles lens experience.
 */
import { AvailabilityState } from "../HeadLabel/HeadLabelObjectController"
import { HeadLabelUpdater } from "../HeadLabel/HeadLabelUpdater"
import { PingMenu } from "../PingMenu/PingMenu"
import { HandMenuReferences } from "./HandMenuReferences"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

/**
 * Controller that connects the hand menu UI to the head label system.
 * Handles user input from the hand menu and updates the head label accordingly.
 */
@component
export class HandMenuController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HandMenuController – connects hand menu UI to head label updates and ping management</span><br/><span style="color: #94A3B8; font-size: 11px;">Wires buttons, toggles, and text fields from HandMenuReferences to the head label and ping systems.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Reference to the hand menu UI components")
  handMenuReferences: HandMenuReferences

  @input
  @hint("Reference to the ping menu for managing active ping connections")
  pingMenu: PingMenu

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Status Defaults</span>')
  @input
  @hint("Default status messages shown when status text is empty")
  defaultStatusMessages: string[] = [
    "Ready to connect!",
    "Open for collaboration",
    "Looking for teammates",
    "Exploring ideas",
    "Building something cool"
  ]

  @input
  @hint("Sub-status labels corresponding to each availability toggle")
  subStatusOptions: string[] = ["Available", "Busy", "Away", "Do Not Disturb"]

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private currentStatusText: string = "Hello from Spectacles!"
  private currentSubStatus: string = "Available"
  private currentAvailability: AvailabilityState = AvailabilityState.Available

  onAwake(): void {
    this.logger = new Logger("HandMenuController", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    if (!this.handMenuReferences) {
      this.logger.warn("No hand menu references assigned")
      return
    }

    this.waitForHeadLabelUpdater()
  }

  private waitForHeadLabelUpdater(): void {
    const headLabelUpdater = HeadLabelUpdater.getInstance()

    if (!headLabelUpdater) {
      this.logger.info("Waiting for HeadLabelUpdater...")
      const retryEvent = this.createEvent("DelayedCallbackEvent")
      retryEvent.bind(() => {
        this.waitForHeadLabelUpdater()
      })
      retryEvent.reset(0.1)
      return
    }

    this.logger.info("HeadLabelUpdater found, setting up...")

    headLabelUpdater.onMyHeadLabelReady(() => {
      this.logger.info("Head label ready, setting up UI connections")

      const headLabelData = headLabelUpdater.getMyHeadLabelData()
      if (headLabelData) {
        this.currentStatusText = headLabelData.statusText
        this.currentSubStatus = headLabelData.subStatus
        this.currentAvailability = headLabelData.availability
      }

      this.setupUIConnections()
      this.updateUIFromCurrentState()
    })
  }

  private setupUIConnections(): void {
    if (this.handMenuReferences.textStatusInputField) {
      this.handMenuReferences.textStatusInputField.text = this.currentStatusText

      this.handMenuReferences.textStatusInputField.onTextChanged.add((newText: string) => {
        this.onStatusTextChanged(newText)
      })

      this.logger.info("Connected status text input field")
    }

    if (this.handMenuReferences.updateStatusButton) {
      this.handMenuReferences.updateStatusButton.onTriggerUp.add(() => {
        this.onUpdateStatusButtonPressed()
      })

      this.logger.info("Connected update status button")
    }

    if (this.handMenuReferences.switchToggleGroupSubStatus) {
      const toggles = this.handMenuReferences.switchToggleGroupSubStatus.toggleables
      if (toggles && toggles.length > this.currentAvailability) {
        toggles.forEach((toggle) => (toggle.isOn = false))
        toggles[this.currentAvailability].toggle(true)
      }

      this.handMenuReferences.switchToggleGroupSubStatus.onToggleSelected.add((args: any) => {
        const toggles = this.handMenuReferences.switchToggleGroupSubStatus.toggleables
        const index = toggles.indexOf(args.toggleable)
        if (index !== -1) {
          this.onAvailabilityChanged(index)
        }
      })

      this.logger.info("Connected availability toggle group")
    }

    if (this.handMenuReferences.closeButton) {
      this.handMenuReferences.closeButton.onTriggerUp.add(() => {
        this.onCloseButtonPressed()
      })

      this.logger.info("Connected close button")
    }

    if (this.handMenuReferences.exitPingButton) {
      this.handMenuReferences.exitPingButton.onTriggerUp.add(() => {
        this.onExitPingButtonPressed()
      })

      this.logger.info("Connected exit ping button")
    }
  }

  private updateUIFromCurrentState(): void {
    if (this.handMenuReferences.textStatusInputField) {
      this.handMenuReferences.textStatusInputField.text = this.currentStatusText
    }

    if (this.handMenuReferences.switchToggleGroupSubStatus) {
      const toggles = this.handMenuReferences.switchToggleGroupSubStatus.toggleables
      if (toggles && toggles.length > this.currentAvailability) {
        toggles.forEach((toggle) => (toggle.isOn = false))
        toggles[this.currentAvailability].toggle(true)
      }
    }
  }

  private onStatusTextChanged(newText: string): void {
    if (!newText || newText.trim() === "") {
      const randomIndex = Math.floor(Math.random() * this.defaultStatusMessages.length)
      newText = this.defaultStatusMessages[randomIndex]

      if (this.handMenuReferences.textStatusInputField) {
        this.handMenuReferences.textStatusInputField.text = newText
      }
    }

    this.currentStatusText = newText
    this.logger.info(`Status text changed to "${newText}"`)
  }

  private onUpdateStatusButtonPressed(): void {
    this.logger.info("Update status button pressed")
    this.logger.info(`Current status text: "${this.currentStatusText}"`)
    this.logger.info(`Current sub-status: "${this.currentSubStatus}"`)

    const headLabelUpdater = HeadLabelUpdater.getInstance()
    if (!headLabelUpdater) {
      this.logger.warn("HeadLabelUpdater not available")
      this.provideFeedback("Error: System not ready")
      return
    }

    headLabelUpdater.updateMyHeadLabelStatus(this.currentStatusText, this.currentSubStatus)

    this.provideFeedback("Status Updated!")
  }

  private onAvailabilityChanged(index: number): void {
    this.currentAvailability = index as AvailabilityState
    this.currentSubStatus = this.subStatusOptions[index] || "Available"

    this.logger.info(`Availability changed to ${this.currentSubStatus} (${index})`)

    const headLabelUpdater = HeadLabelUpdater.getInstance()
    if (!headLabelUpdater) {
      this.logger.warn("HeadLabelUpdater not available")
      return
    }

    headLabelUpdater.updateMyHeadLabelAvailability(this.currentAvailability)
    headLabelUpdater.updateMyHeadLabelStatus(this.currentStatusText, this.currentSubStatus)

    this.provideFeedback(`Status: ${this.currentSubStatus}`)
  }

  private onExitPingButtonPressed(): void {
    this.logger.info("Exit ping button pressed")

    if (!this.pingMenu) {
      this.logger.warn("No ping system controller assigned")
      this.provideFeedback("Ping system not available")
      return
    }

    const activeConnections = this.pingMenu.getActivePingConnections()

    if (activeConnections.length === 0) {
      this.provideFeedback("No active ping connections")
      return
    }

    activeConnections.forEach((userId) => {
      this.pingMenu.exitPingConnection(userId)
    })

    const headLabelUpdater = HeadLabelUpdater.getInstance()
    if (headLabelUpdater) {
      const headLabelManager = headLabelUpdater.getHeadLabelManager()
      if (headLabelManager) {
        const myHeadLabel = headLabelManager.getMyHeadLabel()
        if (myHeadLabel) {
          this.logger.info("Resetting local head label material to default")
          myHeadLabel.updatePingVisual(false)
        }
      }
    }

    if (
      this.handMenuReferences.pingDefaultMaterial &&
      this.handMenuReferences.pingMaterialTargets &&
      this.handMenuReferences.pingMaterialTargets.length > 0
    ) {
      this.handMenuReferences.pingMaterialTargets.forEach((target, index) => {
        if (target) {
          const renderMeshVisual = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
          if (renderMeshVisual) {
            renderMeshVisual.mainMaterial = this.handMenuReferences.pingDefaultMaterial
            this.logger.info(`Reset hand menu target ${index} to default material`)
          }
        }
      })
    }

    this.provideFeedback(`Exited ${activeConnections.length} ping connection(s)`)
    this.logger.info(`Exited ${activeConnections.length} ping connections`)
  }

  private onCloseButtonPressed(): void {
    this.logger.info("Close button pressed")
    this.sceneObject.enabled = false
    this.logger.info("Menu closed")
  }

  private provideFeedback(message: string): void {
    this.logger.info("Feedback - " + message)

    if (
      this.handMenuReferences.pingAcceptedMaterial &&
      this.handMenuReferences.pingMaterialTargets &&
      this.handMenuReferences.pingMaterialTargets.length > 0
    ) {
      let targetsUpdated = 0
      const renderMeshVisuals: RenderMeshVisual[] = []

      this.handMenuReferences.pingMaterialTargets.forEach((target, index) => {
        if (target) {
          const renderMeshVisual = target.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
          if (renderMeshVisual) {
            renderMeshVisual.mainMaterial = this.handMenuReferences.pingAcceptedMaterial
            renderMeshVisuals.push(renderMeshVisual)
            targetsUpdated++
            this.logger.info(`Applied feedback material to target ${index} RenderMeshVisual`)
          } else {
            this.logger.warn(`Ping material target ${index} has no RenderMeshVisual component`)
          }
        } else {
          this.logger.warn(`Ping material target ${index} is null`)
        }
      })

      if (renderMeshVisuals.length > 0) {
        const resetEvent = this.createEvent("DelayedCallbackEvent")
        resetEvent.bind(() => {
          renderMeshVisuals.forEach((renderMeshVisual) => {
            if (renderMeshVisual && this.handMenuReferences.pingDefaultMaterial) {
              renderMeshVisual.mainMaterial = this.handMenuReferences.pingDefaultMaterial
            }
          })
          this.logger.info(`Reset ${renderMeshVisuals.length} targets to default material after feedback`)
        })
        resetEvent.reset(0.5)
      }

      this.logger.info(
        `Applied feedback material to ${targetsUpdated}/${this.handMenuReferences.pingMaterialTargets.length} hand menu targets`
      )
    }
  }

  /**
   * Public method to set a custom status message
   */
  public setStatusMessage(message: string): void {
    this.currentStatusText = message

    if (this.handMenuReferences.textStatusInputField) {
      this.handMenuReferences.textStatusInputField.text = message
    }

    const headLabelUpdater = HeadLabelUpdater.getInstance()
    if (headLabelUpdater) {
      headLabelUpdater.updateMyHeadLabelStatus(message, this.currentSubStatus)
    }
  }

  /**
   * Public method to set availability
   */
  public setAvailability(state: AvailabilityState): void {
    this.currentAvailability = state
    this.currentSubStatus = this.subStatusOptions[state] || "Available"

    if (this.handMenuReferences.switchToggleGroupSubStatus) {
      const toggles = this.handMenuReferences.switchToggleGroupSubStatus.toggleables
      if (toggles && toggles.length > state) {
        toggles.forEach((toggle) => (toggle.isOn = false))
        toggles[state].toggle(true)
      }
    }

    const headLabelUpdater = HeadLabelUpdater.getInstance()
    if (headLabelUpdater) {
      headLabelUpdater.updateMyHeadLabelAvailability(state)
      headLabelUpdater.updateMyHeadLabelStatus(this.currentStatusText, this.currentSubStatus)
    }
  }
}
