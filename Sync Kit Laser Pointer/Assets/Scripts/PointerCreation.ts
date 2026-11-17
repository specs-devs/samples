/**
 * SPECS Inc. 2027
 * Pointer Creation component for the Laser Pointer Glasses lens.
 */
import {Interactable} from "InteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {Interactor} from "InteractionKit.lspkg/Core/Interactor/Interactor"
import {InteractorEvent} from "InteractionKit.lspkg/Core/Interactor/InteractorEvent"
import {Instantiator} from "SyncKit.lspkg/Components/Instantiator"
import {NetworkRootInfo} from "SyncKit.lspkg/Core/NetworkRootInfo"
import {Pointer} from "./Pointer"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

@component
export class PointerCreation extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">PointerCreation – Laser pointer instantiation controller</span><br/><span style="color: #94A3B8; font-size: 11px;">Spawns networked pointer instances when users interact with the target object.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The interactable that triggers pointer creation on user interaction")
  targetObjectInteractable: Interactable

  @input
  @hint("The Instantiator used to create new networked pointer instances")
  pointerInstantiator: Instantiator

  @input
  @hint("The pointer prefab to instantiate for each interaction")
  pointerPrefab: ObjectPrefab

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  onAwake(): void {
    this.logger = new Logger("PointerCreation", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
    this.targetObjectInteractable.onTriggerStart.add((interactorEvent: InteractorEvent) => {
      this.spawnPointer(interactorEvent.interactor)
    })
  }

  private spawnPointer(interactor: Interactor): void {
    const spawnOptions = {
      // Spawn directly at the aim point so local and remote instances never
      // appear at the world origin before the first position update arrives.
      worldPosition: interactor.targetHitPosition ?? undefined,
      // Marks only live ~2s after release; don't restore them on session join.
      persistence: "Ephemeral" as keyof typeof RealtimeStoreCreateOptions.Persistence,
    }
    this.pointerInstantiator.instantiate(this.pointerPrefab, spawnOptions, (networkRootInfo: NetworkRootInfo) => {
      const object = networkRootInfo.instantiatedObject
      const pointerComponent = object.getComponent<Pointer>(Pointer.getTypeName())
      if (pointerComponent) {
        pointerComponent.setInteractor(interactor)
      }
    })
  }
}