/**
 * Specs Inc. 2026
 * Interactable Line Projection component for the DJ Specs Spectacles lens.
 */
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {
  InteractableManipulation,
  TransformEventArg
} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractableManipulation/InteractableManipulation"
import { Logger } from "Utilities.lspkg/Scripts/Utils/Logger"
import { bindStartEvent } from "SnapDecorators.lspkg/decorators"

@component
export class InteractableLineProjection extends BaseScriptComponent {
  @ui.label(
    '<span style="color: #60A5FA;">InteractableLineProjection – line-clamped position projection</span><br/><span style="color: #94A3B8; font-size: 11px;">Projects an interactable object onto a line and outputs a normalized 0-2 value.</span>'
  )
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("The Interactable component to monitor")
  interactable: Interactable

  @input
  @hint("The InteractableManipulation component for manipulation events")
  manipulationComponent: InteractableManipulation

  @input
  @hint("The start point of the line (represents minimum value)")
  lineStart: SceneObject

  @input
  @hint("The end point of the line (represents maximum value)")
  lineEnd: SceneObject

  @input
  @hint("The visual object that will move along the line to show projected position")
  visualReference: SceneObject

  @input
  @allowUndefined
  @hint("Script component to call when projection value changes")
  callback: ScriptComponent | null = null

  @input
  @hint("Method name to call on the callback script")
  methodName: string = ""

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @input
  @hint("Enable projection and visual reference updates")
  enableProjection: boolean = true

  @input
  @hint("Only update during manipulation (if false, updates every frame)")
  onlyDuringManipulation: boolean = true

  @input
  @hint("Double the mapping so the value ranges from 0 to 2 instead of 0 to 1")
  doubleMapping: boolean = true

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger
  private isManipulating: boolean = false
  private lastNormalizedValue: number = -1

  onAwake(): void {
    this.logger = new Logger(
      "InteractableLineProjection",
      this.enableLogging || this.enableLoggingLifecycle,
      true
    )
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")

    if (!this.onlyDuringManipulation) {
      this.createEvent("UpdateEvent").bind(() => {
        this.update()
      })
    }
  }

  @bindStartEvent
  onStart(): void {
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onStart()")

    if (!this.interactable) {
      this.logger.error("Interactable component is required")
      return
    }

    if (!this.manipulationComponent) {
      this.logger.error("InteractableManipulation component is required")
      return
    }

    if (!this.lineStart || !this.lineEnd) {
      this.logger.error("Line Start and Line End are required")
      return
    }

    if (!this.visualReference) {
      this.logger.error("Visual Reference object is required")
      return
    }

    this.setupManipulationCallbacks()
    this.logger.debug("InteractableLineProjection initialized")

    this.updateProjection()
  }

  private setupManipulationCallbacks(): void {
    if (this.manipulationComponent) {
      this.manipulationComponent.onManipulationStart.add((event: TransformEventArg) => {
        this.onManipulationStarted(event)
      })

      this.manipulationComponent.onManipulationUpdate.add((event: TransformEventArg) => {
        this.onManipulationUpdate(event)
      })

      this.manipulationComponent.onManipulationEnd.add((event: TransformEventArg) => {
        this.onManipulationEnded(event)
      })
    }
  }

  private onManipulationStarted(event: TransformEventArg): void {
    this.isManipulating = true
    this.logger.debug("Manipulation started - projection active")
  }

  private onManipulationUpdate(event: TransformEventArg): void {
    if (this.enableProjection) {
      this.updateProjection()
    }
  }

  private onManipulationEnded(event: TransformEventArg): void {
    this.isManipulating = false
    this.logger.debug("Manipulation ended - snapping to projected position")

    if (this.visualReference) {
      const visualPosition = this.visualReference.getTransform().getWorldPosition()
      this.manipulationComponent.getManipulateRoot().setWorldPosition(visualPosition)
    }
  }

  private update(): void {
    if (this.enableProjection && (!this.onlyDuringManipulation || this.isManipulating)) {
      this.updateProjection()
    }
  }

  private updateProjection(): void {
    if (!this.lineStart || !this.lineEnd || !this.visualReference) {
      return
    }

    const objectPosition = this.manipulationComponent.getManipulateRoot().getWorldPosition()
    const lineStartPosition = this.lineStart.getTransform().getWorldPosition()
    const lineEndPosition = this.lineEnd.getTransform().getWorldPosition()

    const projectedPosition = this.getProjectionOnLine(objectPosition, lineStartPosition, lineEndPosition)

    this.visualReference.getTransform().setWorldPosition(projectedPosition)

    const normalizedValue = this.calculateNormalizedValue(projectedPosition, lineStartPosition, lineEndPosition)

    if (Math.abs(normalizedValue - this.lastNormalizedValue) > 0.001) {
      this.invokeCallback(normalizedValue)
      this.lastNormalizedValue = normalizedValue
    }
  }

  private getProjectionOnLine(point: vec3, lineStart: vec3, lineEnd: vec3): vec3 {
    const lineDirection = lineEnd.sub(lineStart)
    const lineLength = lineDirection.length

    if (lineLength === 0) {
      return lineStart
    }

    const normalizedDirection = lineDirection.normalize()
    const startToPoint = point.sub(lineStart)
    const projectionLength = startToPoint.dot(normalizedDirection)
    const clampedProjection = Math.max(0, Math.min(projectionLength, lineLength))

    return lineStart.add(normalizedDirection.uniformScale(clampedProjection))
  }

  private calculateNormalizedValue(projectedPosition: vec3, lineStart: vec3, lineEnd: vec3): number {
    const lineDirection = lineEnd.sub(lineStart)
    const lineLength = lineDirection.length

    if (lineLength === 0) {
      return 0
    }

    const startToProjected = projectedPosition.sub(lineStart)
    const projectionLength = startToProjected.dot(lineDirection.normalize())

    if (this.doubleMapping) {
      const normalizedValue = (projectionLength / lineLength) * 2
      return MathUtils.clamp(normalizedValue, 0, 2)
    } else {
      const normalizedValue = projectionLength / lineLength
      return MathUtils.clamp(normalizedValue, 0, 1)
    }
  }

  private invokeCallback(normalizedValue: number): void {
    if (this.callback && (this.callback as any)[this.methodName]) {
      try {
        (this.callback as any)[this.methodName](normalizedValue)
        this.logger.debug(`Callback invoked with value: ${normalizedValue}`)
      } catch (error) {
        this.logger.error(`Error invoking callback: ${error}`)
      }
    }
  }

  setLineBoundaries(startPoint: SceneObject, endPoint: SceneObject): void {
    this.lineStart = startPoint
    this.lineEnd = endPoint
    this.logger.debug("Line boundaries updated")

    if (this.enableProjection) {
      this.updateProjection()
    }
  }

  setProjectionEnabled(enabled: boolean): void {
    this.enableProjection = enabled
    this.logger.debug(`Projection ${enabled ? "enabled" : "disabled"}`)
  }

  setCallback(callbackScript: ScriptComponent, methodName: string): void {
    this.callback = callbackScript
    this.methodName = methodName
    this.logger.debug(`Callback updated: ${methodName}`)
  }

  getCurrentNormalizedValue(): number {
    return this.lastNormalizedValue
  }

  getCurrentProjectedPosition(): vec3 {
    if (!this.visualReference) {
      return vec3.zero()
    }
    return this.visualReference.getTransform().getWorldPosition()
  }
}
