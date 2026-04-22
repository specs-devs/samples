import {delayAFrame} from "./DelayAFrame"

/**
 * Shows a splash screen and initializes the scene for an indoor experience.
 */
@component
export class TourSplashScreen extends BaseScriptComponent {
  @input firstLocation: LocatedAtComponent
  @input disableOnBoot: SceneObject[]
  @input enableOnTourStart: SceneObject[]
  @input disableOnTourStart: SceneObject[]
  @input loadingIndicator: SceneObject

  private onAwake(): void {
    this.createEvent("OnStartEvent").bind(async () => {
      this.loadingIndicator.enabled = true

      this.disableOnBoot.forEach(async (e) => {
        await delayAFrame()
        e.enabled = false
      })

      this.firstLocation.onFound.add(async () => {
        this.enableOnTourStart.forEach((e) => (e.enabled = true))
        this.disableOnTourStart.forEach((e) => (e.enabled = false))
      })

      this.firstLocation.onReady.add(() => {
        this.loadingIndicator.enabled = false
      })
    })
  }
}
