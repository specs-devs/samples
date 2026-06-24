/**
 * Specs Inc. 2026
 * Utility types and functions for bitmoji joint access and IK state management in the Air Hockey lens.
 */

import {ArmIK} from "./IK/ArmIK"
import {NeckTorsoIK} from "./IK/NeckTorsoIK"
import {JOINT_NAMES} from "./BitmojiConstants"

export interface JointNode {
  transform: Transform
  sceneObject: SceneObject
}

export interface PlayerBitmoji {
  connectionId: string | null
  bitmoji: SceneObject | null
  armIK: ArmIK | null
  restingArmIK: ArmIK | null
  neckTorsoIK: NeckTorsoIK | null
  poleObject: SceneObject | null
  targetObject: SceneObject | null
  restPoleObject: SceneObject | null
  restTargetObject: SceneObject | null
}

export function createPlayerBitmoji(): PlayerBitmoji {
  return {
    connectionId: null,
    bitmoji: null,
    armIK: null,
    restingArmIK: null,
    neckTorsoIK: null,
    poleObject: null,
    targetObject: null,
    restPoleObject: null,
    restTargetObject: null
  }
}

export interface BitmojiJoints {
  rightArm: {
    shoulder: JointNode | null
    elbow: JointNode | null
    wrist: JointNode | null
  }
  leftArm: {
    shoulder: JointNode | null
    elbow: JointNode | null
    wrist: JointNode | null
  }
  neck: SceneObject | null
  torso: SceneObject | null
}

function findMultipleSceneObjectsByName(root: SceneObject, names: string[]): Map<string, SceneObject> {
  const found = new Map<string, SceneObject>()
  const remaining = new Set(names)

  function traverse(node: SceneObject): void {
    if (remaining.size === 0) return

    if (remaining.has(node.name)) {
      found.set(node.name, node)
      remaining.delete(node.name)
    }

    const childCount = node.getChildrenCount()
    for (let i = 0; i < childCount; i++) {
      traverse(node.getChild(i))
      if (remaining.size === 0) return
    }
  }

  traverse(root)
  return found
}

function toJointNode(sceneObject: SceneObject | null | undefined): JointNode | null {
  if (!sceneObject) return null
  return {
    sceneObject: sceneObject,
    transform: sceneObject.getTransform()
  }
}

export function getBitmojiJoints(bitmojiRoot: SceneObject): BitmojiJoints {
  const sceneObjects = findMultipleSceneObjectsByName(bitmojiRoot, [
    JOINT_NAMES.RIGHT_SHOULDER,
    JOINT_NAMES.RIGHT_ELBOW,
    JOINT_NAMES.RIGHT_WRIST,
    JOINT_NAMES.LEFT_SHOULDER,
    JOINT_NAMES.LEFT_ELBOW,
    JOINT_NAMES.LEFT_WRIST,
    JOINT_NAMES.NECK,
    JOINT_NAMES.TORSO
  ])

  return {
    rightArm: {
      shoulder: toJointNode(sceneObjects.get(JOINT_NAMES.RIGHT_SHOULDER)),
      elbow: toJointNode(sceneObjects.get(JOINT_NAMES.RIGHT_ELBOW)),
      wrist: toJointNode(sceneObjects.get(JOINT_NAMES.RIGHT_WRIST))
    },
    leftArm: {
      shoulder: toJointNode(sceneObjects.get(JOINT_NAMES.LEFT_SHOULDER)),
      elbow: toJointNode(sceneObjects.get(JOINT_NAMES.LEFT_ELBOW)),
      wrist: toJointNode(sceneObjects.get(JOINT_NAMES.LEFT_WRIST))
    },
    neck: sceneObjects.get(JOINT_NAMES.NECK) ?? null,
    torso: sceneObjects.get(JOINT_NAMES.TORSO) ?? null
  }
}
