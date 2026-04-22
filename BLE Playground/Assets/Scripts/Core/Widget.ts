/**
 * Specs Inc. 2026
 * This script handles the generic container for all peripheral controllers. Handle
 * parenting/unparenting when snapped to main hub
 */
import {Frame} from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"
import {ScanResultType} from "./ScanResult"

@component
export class Widget extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">Widget – peripheral controller container</span><br/><span style="color: #94A3B8; font-size: 11px;">Manages parenting, positioning and billboarding of spawned peripheral controller widgets.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("UIKit Frame that controls translation and snapping behaviour")
  frame: Frame

  private onTranslationStartRemover

  private so: SceneObject
  private tr: Transform

  // This is the node on the ble ui hub
  private nodeTr: Transform
  private hiddenPos: vec3

  private isFreed: boolean

  private type: ScanResultType

  private bleHubSo: SceneObject
  private bleHubTr: Transform

  onAwake() {
    this.so = this.getSceneObject()
    this.tr = this.getTransform()
    this.isFreed = false
    this.hiddenPos = new vec3(0, 2000, 0)
  }

  @bindStartEvent
  onStart() {
    // NOTE: disabling snapping on container due to bug that will be fixed soon.
    if (this.frame && this.frame.onTranslationStart) {
      this.onTranslationStartRemover = this.frame.onTranslationStart.add(() => this.onTranslationStart())
    }
  }

  init(node: SceneObject, myType: ScanResultType) {
    this.type = myType
    if (node) {
      this.nodeTr = node.getTransform()
      this.bleHubSo = node.getParent()
      if (this.bleHubSo) {
        this.bleHubTr = this.bleHubSo.getTransform()
      }
      this.parentToHub()
    }
  }

  getType() {
    return this.type
  }

  onTranslationStart() {
    // It's our first translation from the "selected scan result widget" spot on the right of the hub
    if (!this.isFreed) {
      const worldPos = this.tr.getWorldPosition()
      const worldRot = this.tr.getWorldRotation()

      if (this.frame && this.frame.transform) {
        this.frame.transform.getSceneObject().setParent(null)
      }

      this.tr.setWorldPosition(worldPos)
      this.tr.setWorldRotation(worldRot)

      if (this.frame && this.frame.billboardComponent) {
        this.frame.billboardComponent.xAxisEnabled = true
        this.frame.billboardComponent.yAxisEnabled = true
      }
      if (this.frame && this.frame.onTranslationStart) {
        this.frame.onTranslationStart.remove(this.onTranslationStartRemover)
      }
      this.isFreed = true
    }
  }

  private parentToHub() {
    // Frame.transform may not be initialized yet if called right after prefab instantiation.
    if (this.frame && this.frame.transform) {
      const worldPos = this.tr.getWorldPosition()
      this.frame.transform.getSceneObject().setParent(this.bleHubSo)
      this.frame.transform.setWorldPosition(worldPos)
      this.frame.transform.setWorldRotation(this.bleHubTr.getWorldRotation())
    } else {
      // Frame not ready — position at node without parenting (stay free-floating)
      print("[Widget] Frame.transform not ready — positioning without parenting")
      this.tr.setWorldPosition(this.nodeTr.getWorldPosition())
      this.tr.setWorldRotation(this.nodeTr.getWorldRotation())
    }
  }

  show(show: boolean) {
    // Once freed, widget is always shown
    if (!this.isFreed) {
      if (show) {
        if (this.nodeTr) {
          this.tr.setWorldPosition(this.nodeTr.getWorldPosition())
          this.tr.setWorldRotation(this.nodeTr.getWorldRotation())
        }
      } else {
        this.tr.setWorldPosition(this.hiddenPos)
      }
    }
  }
}
