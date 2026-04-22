/**
 * Specs Inc. 2026
 * Grid Position component for the Tic Tac Toe Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {GRID_SPACING, GRID_X_OFFSET, GRID_Z_OFFSET} from "./constants"

@component
export class GridPosition extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GridPosition – Snap point grid coordinate</span><br/><span style="color: #94A3B8; font-size: 11px;">Defines the layer, row, and column of a snapping point in the 3D game grid.</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Grid Coordinate</span>')
  @input
  @hint("Layer index (Z axis) of this grid position")
  layer: number

  @input
  @hint("Row index (X axis) of this grid position")
  row: number

  @input
  @hint("Column index (Y axis) of this grid position")
  col: number

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private logger: Logger

  constructor() {
    super()
    this.getTransform().setLocalPosition(
      new vec3(
        (this.col + 1) * -GRID_SPACING - GRID_X_OFFSET,
        (this.row + 1) * -GRID_SPACING,
        (this.layer + 1) * -GRID_SPACING - GRID_Z_OFFSET
      )
    )
  }

  onAwake() {
    this.logger = new Logger("GridPosition", this.enableLogging || this.enableLoggingLifecycle, true)
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()")
  }

  getCoordinates() {
    return {
      layer: this.layer,
      row: this.row,
      col: this.col
    }
  }

  getPosition() {
    return this.getTransform().getWorldPosition()
  }
}
