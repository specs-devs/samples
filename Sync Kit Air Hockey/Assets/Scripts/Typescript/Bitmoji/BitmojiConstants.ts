/**
 * Specs Inc. 2026
 * Shared tunable constants for bitmoji scale, IK offsets, and joint names in the Air Hockey lens.
 */

export const BITMOJI_SCALE = 140.0
export const POLE_SCALE_DIVISOR = 5.0

export const PADDLE_VERTICAL_OFFSET = 3.0
export const PADDLE_HORIZONTAL_OFFSET = -2.0
export const PADDLE_DEPTH_OFFSET = -3.5

export const RESTING_ARM_VERTICAL_OFFSET = 5.0
export const RESTING_ARM_HORIZONTAL_OFFSET = -4.0
export const RESTING_ARM_DEPTH_OFFSET = -2.5

export const ARM_RESPONSIVENESS = 8

export const ACTIVE_ARM_POLE_BASE = { x: -60, y: -5, z: 15 }
export const RESTING_ARM_POLE_BASE = { x: 60, y: -15, z: -30 }

export const NECK_SLERP_FACTOR = 8
export const TORSO_SLERP_FACTOR = 2
export const TORSO_FOLLOW_AMOUNT = 0.3
export const VERTICAL_DAMPING = 0.5

export const DEFAULT_IK_RESPONSIVENESS = 20
export const RESTING_ARM_PRESOLVE_ITERATIONS = 10

export const JOINT_NAMES = {
  RIGHT_SHOULDER: "R_armUpper0001_bind_JNT",
  RIGHT_ELBOW: "R_armLower0001_bind_JNT",
  RIGHT_WRIST: "R_hand0001_bind_JNT",
  LEFT_SHOULDER: "L_armUpper0001_bind_JNT",
  LEFT_ELBOW: "L_armLower0001_bind_JNT",
  LEFT_WRIST: "L_hand0001_bind_JNT",
  NECK: "C_neck0001_bind_JNT",
  TORSO: "C_spine0003_bind_JNT"
} as const
