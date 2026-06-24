/**
 * Specs Inc. 2026
 * Activate When In Camera View component for the Custom Locations Spectacles lens.
 */
import { LocatedObject } from "./LocatedObject"
import { bindUpdateEvent, depends } from "SnapDecorators.lspkg/decorators"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * Tracks the users position and calls activate and deactivate functions on
 * attached listeners.
 */
@component
export class ActivateWhenInCameraView extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ActivateWhenInCameraView – Activates objects when in camera view</span><br/><span style="color: #94A3B8; font-size: 11px;">Tracks user position and calls activate/deactivate on listeners based on distance and camera visibility.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Camera</span>')
  @input
  @hint("Camera used to check sphere visibility and measure distance to the location")
  camera!: Camera

  @ui.label('<span style="color: #60A5FA;">Location Object</span>')
  @input
  @allowUndefined
  @hint("Optional SceneObject to use as center, will use the center of this SceneObject otherwise")
  centerReference: SceneObject

  @input("Component.ScriptComponent[]")
  @hint("List of LocatedObject listeners to activate or deactivate")
  listenerObjects: LocatedObject[]

  @ui.label('<span style="color: #60A5FA;">Activation Settings</span>')
  @input
  @hint("Radius of the sphere used to check if the location is in camera view")
  sphereInViewForActivationRadius: number = 600

  @input
  @hint("Distance from the location center in cm to trigger activation")
  distanceForActivation: number = 1000

  @input
  @hint("Multiplier applied to distanceForActivation to compute the deactivation distance")
  deActivateDistanceMultiplier: number = 1.5

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  @depends("LocatedAtComponent")
  private locatedAt: LocatedAtComponent

  private distanceForDeActivation: number
  private centerReferenceTransform = null

  private didLocalize: boolean = false
  private isActive: boolean = false

  private viewSphereColor: vec4 = new vec4(
    0.25 + Math.random() * 0.75,
    0.25 + Math.random() * 0.75,
    0.25 + Math.random() * 0.75,
    1.0
  )

  onAwake(): void {
    this.logger = new Logger("ActivateWhenInCameraView", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    this.locatedAt.onFound.add(() => {
      this.didLocalize = true
      this.logger.info("Localized " + this.getSceneObject().name)

      this.listenerObjects.forEach((element: LocatedObject) => {
        if (element.localize) {
          element.localize()
        }
      })
    })

    this.distanceForDeActivation = this.distanceForActivation * this.deActivateDistanceMultiplier

    this.centerReferenceTransform = this.getSceneObject().getTransform()
    if (this.centerReference) {
      this.centerReferenceTransform = this.centerReference.getTransform()
    }
  }

  @bindUpdateEvent
  private onUpdate(): void {
    let isLocalized = this.didLocalize
    if (global.deviceInfoSystem.isEditor()) {
      isLocalized = true
    }

    const cameraPos = this.camera.getTransform().getWorldPosition()
    const p = this.centerReferenceTransform.getWorldPosition()

    const cameraDistance2D = new vec2(p.x, p.z).distance(new vec2(cameraPos.x, cameraPos.z))

    if (this.isActive) {
      if (cameraDistance2D > this.distanceForDeActivation) {
        this.isActive = false
        this.listenerObjects.forEach((element: LocatedObject) => {
          if (element.deactivate) {
            element.deactivate()
          }
        })
      }
    } else {
      if (cameraDistance2D < this.distanceForActivation && isLocalized) {
        if (this.camera.isSphereVisible(p, this.sphereInViewForActivationRadius)) {
          this.isActive = true
          this.listenerObjects.forEach((element: LocatedObject) => {
            if (element.activate) {
              element.activate()
            }
          })
        }
      }
    }
  }
}
