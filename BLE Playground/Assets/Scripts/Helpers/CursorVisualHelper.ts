/**
 * Specs Inc. 2026
 * Cursor Visual Helper component for the BLE Playground Spectacles lens.
 */
import {CursorController} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractorCursor/CursorController"
import {InteractorCursor} from "SpectaclesInteractionKit.lspkg/Components/Interaction/InteractorCursor/InteractorCursor"

@component
export class CursorVisualHelper extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">CursorVisualHelper – cursor show/hide singleton</span><br/><span style="color: #94A3B8; font-size: 11px;">Exposes a static API to show or hide all SIK cursors by adjusting their render order.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @input
  @hint("SIK CursorController used to retrieve all active cursor instances")
  cursorController: CursorController

  private static instance: CursorVisualHelper
  private originalRenderOrder: number

  private constructor() {
    super()
  }

  public static getInstance(): CursorVisualHelper {
    if (!CursorVisualHelper.instance) {
      throw new Error("Trying to get CursorVisualHelper instance, but it hasn't been set.  You need to call it later.")
    }
    return CursorVisualHelper.instance
  }

  onAwake() {
    this.originalRenderOrder = 9999
    if (!CursorVisualHelper.instance) {
      CursorVisualHelper.instance = this
    } else {
      throw new Error("CursorVisualHelper already has an instance.  Aborting.")
    }
  }

  showCursor(show: boolean) {
    const cursors: InteractorCursor[] = this.cursorController.getAllCursors()
    cursors.forEach((cursor) => {
      if (show) {
        cursor.renderOrder = this.originalRenderOrder
      } else {
        cursor.renderOrder = -1
      }
    })
  }
}
