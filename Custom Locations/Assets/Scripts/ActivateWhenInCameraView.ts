/**
 * Glasses Inc. 2026
 * Activate When In Camera View component for the CustomLocations package.
 *
 * Attach next to a LocatedAtComponent (a child of a CustomLocationGroupComponent). Once the
 * location is found, it tracks the wearer's position and calls activate() / deactivate() on the
 * attached LocatedObject listeners based on distance and camera visibility.
 */
import {LocatedObject} from "./LocatedObject"
import {Logger} from "./Logger"

@component
export class ActivateWhenInCameraView extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">ActivateWhenInCameraView – Activates objects when in camera view</span><br/><span style="color: #94A3B8; font-size: 11px;">Tracks the wearer\'s position and calls activate/deactivate on listeners based on distance and camera visibility.</span>'
  )
  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Camera</span>')
  @input
  @hint("Camera used to check sphere visibility and measure distance to the location")
  camera!: Camera

  @ui.label('<span style="color: #60A5FA;">Location Object</span>')
  @input
  @allowUndefined
  @hint("Optional SceneObject used as the location center; defaults to this SceneObject")
  centerReference: SceneObject

  @input("Component.ScriptComponent[]")
  @hint("LocatedObject listeners (ScaleInLocatedObject, AudioLocatedObject, ...) to activate or deactivate")
  listenerObjects: LocatedObject[]

  @ui.label('<span style="color: #60A5FA;">Activation Settings</span>')
  @input
  @hint("Radius (cm) of the sphere used to check if the location is in camera view")
  sphereInViewForActivationRadius: number = 600

  @input
  @hint("Distance (cm) from the location center that triggers activation")
  distanceForActivation: number = 1000

  @input
  @hint("Multiplier applied to distanceForActivation to compute the deactivation distance")
  deActivateDistanceMultiplier: number = 1.5

  @input
  @hint("In Lens Studio the location is treated as already localized so the flow can be tested in Preview")
  simulateLocalizedInEditor: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  private logger: Logger
  private locatedAt: LocatedAtComponent | null = null
  private centerTransform: Transform
  private distanceForDeActivation: number = 0

  private didLocalize: boolean = false
  private isActive: boolean = false
  // Set by activateListeners(): keeps the content on until deactivateListeners() is called.
  private isForced: boolean = false

  onAwake(): void {
    this.logger = new Logger("ActivateWhenInCameraView", this.enableLogging)

    this.locatedAt = this.getSceneObject().getComponent("LocatedAtComponent") as LocatedAtComponent | null
    if (this.locatedAt) {
      this.locatedAt.onFound.add(() => this.onLocationFound())
      this.locatedAt.onLost.add(() => this.logger.info(`Location lost: ${this.getSceneObject().name}`))
    } else {
      this.logger.error(
        `No LocatedAtComponent on "${this.getSceneObject().name}". Add this script to the SceneObject that holds the Located At component.`
      )
    }

    this.distanceForDeActivation = this.distanceForActivation * this.deActivateDistanceMultiplier
    this.centerTransform = (this.centerReference ?? this.getSceneObject()).getTransform()

    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  /** True once the LocatedAtComponent reported onFound (or always in the editor when simulating). */
  get isLocalized(): boolean {
    return this.didLocalize || (this.simulateLocalizedInEditor && global.deviceInfoSystem.isEditor())
  }

  /** True while the listeners are activated. */
  get isActivated(): boolean {
    return this.isActive
  }

  /** Force activation, e.g. from a debug panel. Stays active (even far away) until deactivateListeners(). */
  activateListeners(): void {
    this.isForced = true
    this.setActive(true)
  }

  /** Deactivate, e.g. from a debug panel, and hand control back to the distance / camera-view check. */
  deactivateListeners(): void {
    this.isForced = false
    this.setActive(false)
  }

  private setActive(active: boolean): void {
    if (this.isActive === active) return
    this.isActive = active
    this.forEachListener((l) => (active ? l.activate?.() : l.deactivate?.()))
  }

  private onLocationFound(): void {
    if (this.didLocalize) return
    this.didLocalize = true
    this.logger.info(`Localized ${this.getSceneObject().name}`)
    this.forEachListener((l) => l.localize?.())
  }

  private onUpdate(): void {
    if (!this.camera) return

    const cameraPos = this.camera.getTransform().getWorldPosition()
    const p = this.centerTransform.getWorldPosition()
    const cameraDistance2D = new vec2(p.x, p.z).distance(new vec2(cameraPos.x, cameraPos.z))

    if (this.isActive) {
      if (!this.isForced && cameraDistance2D > this.distanceForDeActivation) {
        this.setActive(false)
      }
      return
    }

    if (cameraDistance2D < this.distanceForActivation && this.isLocalized) {
      if (this.camera.isSphereVisible(p, this.sphereInViewForActivationRadius)) {
        this.setActive(true)
      }
    }
  }

  private forEachListener(fn: (listener: LocatedObject) => void): void {
    if (!this.listenerObjects) return
    for (const listener of this.listenerObjects) {
      if (!listener) continue
      try {
        fn(listener)
      } catch (e) {
        this.logger.error(`Listener callback failed: ${e}`)
      }
    }
  }
}
