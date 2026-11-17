/**
 * SPECS Inc. 2027
 * Carousel placement for the Path Pioneer lens.
 */
import WorldCameraFinderProvider from "InteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

/**
 * Lowers the ExampleCarousel on this SceneObject below the Path Pioneer panels, so its
 * "+" stays reachable (outside the panels' Backplate) while a panel is shown.
 * Attach it next to the ExampleCarousel component.
 */
@component
export class CarouselPlacement extends BaseScriptComponent {
  @input
  @hint("How much lower (cm) than the carousel's default place it appears")
  extraDrop: number = 35

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => {
      // The carousel places itself on its own OnStart; move it once that has happened.
      const delay = this.createEvent("DelayedCallbackEvent")
      delay.bind(() => this.lower())
      delay.reset(0)
    })
  }

  private lower(): void {
    const head = WorldCameraFinderProvider.getInstance().getWorldPosition()
    const transform = this.getTransform()
    const position = transform.getWorldPosition().add(vec3.up().uniformScale(-this.extraDrop))
    transform.setWorldPosition(position)
    // Tilted up to face the head, like the carousel does at its default place.
    transform.setWorldRotation(quat.lookAt(head.sub(position).normalize(), vec3.up()))
  }
}
