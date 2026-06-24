/**
 * Specs Inc. 2026
 * Grabbable Outline Feedback component for the Throw Lab Spectacles lens.
 */
import {GrabbableObject} from "Scripts/GrabbableObject"
import {bindStartEvent, bindEnableEvent, bindDisableEvent} from "SnapDecorators.lspkg/decorators"
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"

/**
 * This class provides visual feedback by adding an outline to mesh visuals when object is grabbed.
 * Works with GrabbableObject component.
 */
@component
export class GrabbableOutlineFeedback extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GrabbableOutlineFeedback – Outline highlight on grab</span><br/><span style="color: #94A3B8; font-size: 11px;">Assign an outline material and mesh visuals to highlight when the object is grabbed.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Visual Settings</span>')
  @input
  @hint("This is the material that will provide the mesh outline.")
  targetOutlineMaterial!: Material

  @input("vec4", "{1, 1, 1, 1}")
  @hint("This is the color of the outline when grabbed.")
  @widget(new ColorWidget())
  grabbedColor: vec4 = new vec4(1, 1, 1, 1)

  @input
  @hint("This is the thickness of the outline.")
  outlineWeight: number = 0.25

  @input
  @hint("These are the meshes that will be outlined when grabbed.")
  meshVisuals: RenderMeshVisual[] = []

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private grabbableObject: GrabbableObject | null = null
  private outlineEnabled: boolean = true
  private highlightMaterial: Material | undefined

  onAwake(): void {
    this.logger = new Logger("GrabbableOutlineFeedback", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")
    this.init()
  }

  @bindEnableEvent
  onEnable(): void {
    this.outlineEnabled = true
  }

  @bindDisableEvent
  onDisable(): void {
    this.outlineEnabled = false
    this.removeMaterialFromRenderMeshArray()
  }

  init() {
    this.highlightMaterial = this.targetOutlineMaterial.clone()
    this.highlightMaterial.mainPass.lineWeight = this.outlineWeight
    this.highlightMaterial.mainPass.lineColor = this.grabbedColor

    this.grabbableObject = this.findGrabbableObjectComponent()
    if (!this.grabbableObject) {
      this.logger.warn("No GrabbableObject found - please add GrabbableObject component to this object")
      return
    }

    this.setupGrabbableCallbacks()
  }

  private findGrabbableObjectComponent(): GrabbableObject | null {
    const allComponents = this.getSceneObject().getComponents("Component.ScriptComponent")
    for (let i = 0; i < allComponents.length; i++) {
      const comp = allComponents[i]
      if (comp && typeof (comp as any).onGrab === "function" && typeof (comp as any).onRelease === "function") {
        return comp as GrabbableObject
      }
    }
    return null
  }

  addMaterialToRenderMeshArray(): void {
    if (!this.outlineEnabled) {
      this.logger.debug("Outline disabled, not adding")
      return
    }

    this.logger.debug(`Adding outline to ${this.meshVisuals.length} meshes`)

    for (let i = 0; i < this.meshVisuals.length; i++) {
      if (!this.meshVisuals[i]) {
        this.logger.debug(`Mesh at index ${i} is null, skipping`)
        continue
      }

      const matCount = this.meshVisuals[i].getMaterialsCount()

      let addMaterial = true
      for (let k = 0; k < matCount; k++) {
        const material = this.meshVisuals[i].getMaterial(k)

        if (this.highlightMaterial !== undefined && material.isSame(this.highlightMaterial)) {
          addMaterial = false
          this.logger.debug(`Outline already exists on mesh ${i}`)
          break
        }
      }

      if (this.highlightMaterial !== undefined && addMaterial) {
        const materials = this.meshVisuals[i].materials
        materials.unshift(this.highlightMaterial)
        this.meshVisuals[i].materials = materials
        this.logger.debug(`Added outline to mesh ${i}`)
      }
    }
  }

  removeMaterialFromRenderMeshArray(): void {
    this.logger.debug(`Removing outline from ${this.meshVisuals.length} meshes`)

    for (let i = 0; i < this.meshVisuals.length; i++) {
      if (!this.meshVisuals[i]) {
        this.logger.debug(`Mesh at index ${i} is null, skipping`)
        continue
      }

      const materials = []

      const matCount = this.meshVisuals[i].getMaterialsCount()
      this.logger.debug(`Mesh ${i} has ${matCount} materials`)

      for (let k = 0; k < matCount; k++) {
        const material = this.meshVisuals[i].getMaterial(k)

        if (this.highlightMaterial !== undefined && material.isSame(this.highlightMaterial)) {
          this.logger.debug(`Found and removing outline material at index ${k}`)
          continue
        }

        materials.push(material)
      }

      this.meshVisuals[i].clearMaterials()

      for (let k = 0; k < materials.length; k++) {
        this.meshVisuals[i].addMaterial(materials[k])
      }

      this.logger.debug(`Mesh ${i} now has ${this.meshVisuals[i].getMaterialsCount()} materials`)
    }
  }

  setupGrabbableCallbacks(): void {
    if (!this.grabbableObject) return

    this.grabbableObject.onGrabStartEvent.add(() => {
      this.addMaterialToRenderMeshArray()
      this.logger.info("Object grabbed - showing outline")
    })

    this.grabbableObject.onGrabEndEvent.add(() => {
      this.removeMaterialFromRenderMeshArray()
      this.logger.info("Object released - hiding outline")
    })
  }
}
