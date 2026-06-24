/**
 * App-wide constants for the Spatial Anchors refresh.
 * UPPER_SNAKE_CASE naming convention.
 */

/** Time in ms before localization is considered timed out. */
export const LOCALIZATION_TIMEOUT_MS: number = 15000

/** Distance (world units) to place new objects in front of the camera. */
export const CAMERA_GAZE_OFFSET: number = 100

/**
 * Forward offset (camera local -Z) when creating a capture-time anchor, per
 * Spatial Anchors docs / `spatial-anchors.md` skill: `worldTransform.mult(mat4.fromTranslation(new vec3(0, 0, -distance)))`.
 * Do not use world-space `back * 60` — on device that often lands tens of units away and stalls mapping.
 */
export const CAPTURE_ANCHOR_FORWARD_DISTANCE: number = 5

/** Maximum number of saved areas. */
export const MAX_AREAS: number = 9

/** Seconds to wait for background save to complete when exiting an area. */
export const SAVE_AWAIT_TIMEOUT_SEC: number = 60

/** Duration in seconds for frame transition animations. */
export const FRAME_TRANSITION_DURATION: number = 0.4

/** Frame sizes (width x height in cm) for each screen state. */
export const FRAME_SIZES: Record<string, vec2> = {
  GetStarted: new vec2(33, 18),
  Capture: new vec2(33, 28),
  InCapture: new vec2(33, 28),
  MyAreas: new vec2(33, 35),
  InArea: new vec2(30, 20),
}

/** Number of columns in the My Areas grid. */
export const AREAS_GRID_COLUMNS: number = 3

/** Number of rows in the My Areas grid. */
export const AREAS_GRID_ROWS: number = 3

/** Grid cell size for the areas grid. */
export const AREAS_GRID_CELL_SIZE: vec2 = new vec2(8, 4)

/** Widget selection grid columns. */
export const WIDGET_GRID_COLUMNS: number = 3

/** Widget selection grid rows. */
export const WIDGET_GRID_ROWS: number = 2

/** Easing function used for frame transitions. */
export const FRAME_EASING: string = "ease-in-out-cubic"

/** Primary UI color (blue) for labels. */
export const UI_COLOR_PRIMARY: string = "#60A5FA"

/** Secondary UI color (gray) for hints. */
export const UI_COLOR_SECONDARY: string = "#94A3B8"
