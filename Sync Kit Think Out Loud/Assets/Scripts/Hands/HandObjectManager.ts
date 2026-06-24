/**
 * Specs Inc. 2026
 * Hand Object Manager handling core logic for the Think Out Loud lens.
 */
import { Instantiator } from "SpectaclesSyncKit.lspkg/Components/Instantiator"
import { SessionController } from "SpectaclesSyncKit.lspkg/Core/SessionController"
import { HandObjectController } from "./HandObjectController"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

@component
export class HandObjectManager extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">HandObjectManager – manages instantiation of synced hand objects for all players</span><br/><span style="color: #94A3B8; font-size: 11px;">Instantiates left and right hand prefabs once the session and instantiator are ready.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("Instantiator component for creating synced hand objects")
  instantiator: Instantiator

  @input
  @hint("Prefab used for the left hand visual")
  leftHandPrefab: ObjectPrefab

  @input
  @hint("Prefab used for the right hand visual")
  rightHandPrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Enable testing mode; uses camera offset instead of hand tracking")
  testingMode: boolean = false

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private myLeftHand: HandObjectController
  private myRightHand: HandObjectController
  private allHands: HandObjectController[] = []

  private onHandsReadyCallbacks: ((leftHand: HandObjectController, rightHand: HandObjectController) => void)[] = []

  onAwake(): void {
    this.logger = new Logger("HandObjectManager", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    SessionController.getInstance().notifyOnReady(() => {
      this.instantiator.notifyOnReady(() => {
        this.instantiateHandObjects()
      })
    })
  }

  subscribe(handObject: HandObjectController): void {
    this.allHands.push(handObject)

    if (handObject.isLocalHand()) {
      if (handObject.getHandType() === "left") {
        this.myLeftHand = handObject
        this.logger.info("Subscribed to local left hand")
      } else if (handObject.getHandType() === "right") {
        this.myRightHand = handObject
        this.logger.info("Subscribed to local right hand")
      }

      if (this.myLeftHand && this.myRightHand) {
        this.logger.info("Both local hands are ready!")
        this.notifyHandsReady(this.myLeftHand, this.myRightHand)
      }
    }

    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  instantiateHandObjects(): void {
    this.logger.info("Instantiating hand objects for " + SessionController.getInstance().getLocalUserName())

    this.instantiator.instantiate(this.leftHandPrefab, {
      onSuccess: (networkRoot) => {
        this.logger.info("Left hand instantiated successfully")
        const handController = networkRoot.sceneObject.getComponent(
          HandObjectController.getTypeName()
        ) as HandObjectController
        if (handController) {
          handController.testingMode = this.testingMode
        }
      },
      onError: (error) => {
        this.logger.error("Error instantiating left hand: " + error)
      }
    })

    this.instantiator.instantiate(this.rightHandPrefab, {
      onSuccess: (networkRoot) => {
        this.logger.info("Right hand instantiated successfully")
        const handController = networkRoot.sceneObject.getComponent(
          HandObjectController.getTypeName()
        ) as HandObjectController
        if (handController) {
          handController.testingMode = this.testingMode
        }
      },
      onError: (error) => {
        this.logger.error("Error instantiating right hand: " + error)
      }
    })
  }

  onUpdate(): void {
    if (this.myLeftHand) {
      this.myLeftHand.onUpdate()
    }
    if (this.myRightHand) {
      this.myRightHand.onUpdate()
    }
  }

  getMyLeftHand(): HandObjectController | null {
    return this.myLeftHand || null
  }

  getMyRightHand(): HandObjectController | null {
    return this.myRightHand || null
  }

  getMyHandsCenter(): vec3 | null {
    if (!this.myLeftHand || !this.myRightHand) {
      return null
    }

    const leftPos = this.myLeftHand.getWorldPosition()
    const rightPos = this.myRightHand.getWorldPosition()

    return new vec3((leftPos.x + rightPos.x) / 2, (leftPos.y + rightPos.y) / 2, (leftPos.z + rightPos.z) / 2)
  }

  getAllRemoteHands(): HandObjectController[] {
    return this.allHands.filter((hand) => !hand.isLocalHand())
  }

  subscribeToHandsReady(callback: (leftHand: HandObjectController, rightHand: HandObjectController) => void): void {
    this.onHandsReadyCallbacks.push(callback)
  }

  private notifyHandsReady(leftHand: HandObjectController, rightHand: HandObjectController): void {
    this.onHandsReadyCallbacks.forEach((callback) => callback(leftHand, rightHand))
  }
}
