# Inverse Kinematics System

This folder contains a lightweight IK (Inverse Kinematics) system for the purpose of animating Bitmoji (or any humanoid rig) in Lens Studio. The system uses the FABRIK algorithm for arm chains and a look-at controller for neck/torso tracking.

## Overview

Inverse Kinematics solves the problem of positioning joints to reach a target. Given a target position (e.g., "hand should be here"), IK calculates the required rotations for all joints in the chain (e.g. shoulder, elbow, wrist).

**Use Cases:**
- Characters reaching for objects
- Head/neck following targets
- Natural character animation in AR/VR

## Files

### FABRIK.ts

Core IK solver implementing the FABRIK (Forward And Backward Reaching Inverse Kinematics) algorithm.

**What it does:**
- Solves 3-joint chains (e.g., shoulder → elbow → wrist)
- Runs iterative forward and backward passes to converge on solution
- Enforces pole constraints to control joint bending direction
- Maintains natural joint rotations with smooth interpolation

**Key Classes:**

### `FABRIK`
Main solver class that processes joint chains.

```typescript
constructor(
    root: SceneObject,
    wrist: JointNode,
    elbow: JointNode, 
    shoulder: JointNode,
    armType: "left" | "right",
    responsiveness: number = 20
)
```

**Methods:**
- `solve(targetTransform: Transform, poleTransform: Transform)` - Computes IK solution for given target
- `initArmPose(targetTransform: Transform)` - Sets initial arm pose
- `applyPoleConstraint()` - Adjusts elbow position to match pole direction (internal)

**Algorithm:**
1. Store original bone lengths to preserve during solving
2. Forward pass: Start at wrist, pull joints toward target
3. Backward pass: Start at shoulder, pull joints back toward root
4. Apply pole constraint to control elbow bend direction
5. Repeat for N iterations (default: 3)
6. Apply rotations with smooth interpolation

**Key Parameters:**
- `ITERATIONS = 3` - Number of solve passes (more = accurate, less = fast)
- `TOLERANCE = 1.0` - Convergence threshold (in cm)
- `responsiveness = 20` - Rotation smoothing speed (higher = snappier)

### `JointNode`
Interface representing a joint in the chain.

```typescript
interface JointNode {
    transform: Transform;    
    sceneObject: SceneObject;
}
```

---

### ArmIK.ts

High-level controller wrapping the FABRIK solver for arm-specific use cases.

**What it does:**
- Manages FABRIK solver instance
- Converts world-space targets to joint-space
- Handles hand rotation separately from position
- Provides simple update interface

**Key Class:**

### `ArmIK`
Wrapper that simplifies arm IK setup and updates.

```typescript
constructor(
    bitmojiRoot: SceneObject,
    shoulder: JointNode,
    elbow: JointNode,
    wrist: JointNode,
    poleObject: SceneObject,
    targetObject: SceneObject,
    armType: "left" | "right",
    responsiveness: number = 20
)
```

**Methods:**
- `update()` - Runs IK solve and applies results
- `updateTargetFromPaddle(paddleTransform, verticalOffset, horizontalOffset, depthOffset)` - Positions target with offsets

**Usage Pattern:**
```typescript
const armIK = new ArmIK(
    bitmojiRoot,
    shoulder,
    elbow,
    wrist,
    poleObject,
    targetObject,
    "right",
    8  // responsiveness
);

// Trigger execution
armIK.update();
```

---

### NeckTorsoIK.ts

Look-at controller for neck and torso with rotation constraints.

**What it does:**
- Rotates neck to look at target with human-like constraints
- Rotates torso to follow neck with damping (defaulted to 30% follow)
- Applies vertical damping to prevent excessive up/down rotation
- Smoothly interpolates rotations for natural movement

**Key Class:**

### `NeckTorsoIK`
Controller for head/upper-body tracking.

```typescript
constructor(
    neckTransform: Transform,
    puckTransform: Transform,
    bitmojiTransform: Transform,
    torsoTransform?: Transform,
    shoulderTransforms?: Transform[]
)
```

**Methods:**
- `update()` - Computes and applies look-at rotations
- `getConstrainedLookDirection()` - Calculates clamped look direction

**Key Parameters:**
- `NECK_SLERP_FACTOR = 8` - Neck rotation speed
- `TORSO_SLERP_FACTOR = 2` - Torso rotation speed (slower)
- `TORSO_FOLLOW_AMOUNT = 0.3` - Torso follows 30% of neck rotation
- `VERTICAL_DAMPING = 0.5` - Reduces extreme vertical rotation

**Constraints:**
The system applies rotation limits to maintain natural poses:
- Maximum pitch (up/down): ±70°
- Maximum yaw (left/right): ±85°
- Vertical damping reduces pitch by 50%

---

## Integration Guide

#### Basic Arm IK Setup

```typescript
import { ArmIK } from "./IK/ArmIK";
import { getBitmojiJoints } from "./BitmojiUtils";

// 1. Find joints in bitmoji hierarchy
const joints = getBitmojiJoints(bitmojiRoot);
const rightArm = joints.rightArm;

// 2. Create pole and target objects
const pole = global.scene.createSceneObject("ArmPole");
pole.setParent(bitmojiRoot);
pole.getTransform().setLocalPosition(new vec3(-60, -5, 15));

const target = global.scene.createSceneObject("ArmTarget");
target.setParent(bitmojiRoot);

// 3. Initialize IK solver
const armIK = new ArmIK(
    bitmojiRoot,
    rightArm.shoulder,
    rightArm.elbow,
    rightArm.wrist,
    pole,
    target,
    "right",
    8  // responsiveness
);

// 4. Update target position and run IK every frame
const updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(() => {
    target.getTransform().setWorldPosition(
        paddle.getTransform().getWorldPosition()
    );
    armIK.update();
});
```

#### Basic Neck Tracking Setup

```typescript
import { NeckTorsoIK } from "./IK/NeckTorsoIK";
import { getBitmojiJoints } from "./BitmojiUtils";

// 1. Find joints
const joints = getBitmojiJoints(bitmojiRoot);
const neck = joints.neck;
const torso = joints.torso;

// 2. Get shoulder transforms for counter-rotation
const shoulderTransforms = [
    joints.leftArm.shoulder?.transform,
    joints.rightArm.shoulder?.transform
].filter(t => t !== null && t !== undefined);

// 3. Initialize controller
const neckIK = new NeckTorsoIK(
    neck.getTransform(),
    puck.getTransform(),      // target to track
    bitmojiRoot.getTransform(),
    torso?.getTransform(),
    shoulderTransforms
);

// 4. Update every frame
const updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(() => {
    neckIK.update();
});
```

---

## Adapting to Other Projects

### For Different Character Rigs

The IK system works with any humanoid rig following standard joint hierarchies:

1. **Replace joint finding logic** - Update `JOINT_NAMES` in `BitmojiConstants.ts` with rig-specific joint names
2. **Adjust pole positions** - Tune pole placement in `BitmojiConstants.ts` for character proportions
3. **Modify constraints** - Adjust rotation limits and parameters in `BitmojiConstants.ts` for character flexibility

### For Different Targets

FABRIK works for any 3-joint chain targeting any object:

**Examples:**
- Foot reaching for ground (hip → knee → ankle)
- Tail following cursor (base → mid → tip)
- Tentacle reaching for object (root → segment1 → segment2)

**Adaptation:**
```typescript
// Any 3-joint chain works
const chainIK = new ArmIK(
    characterRoot,
    joint1,
    joint2,
    joint3,
    poleObject,
    targetObject,
    "right",
    20
);
chainIK.update();
```

**Optimization tips**
- Reduce `ITERATIONS` in FABRIK.ts (3 → 2) for better performance
- Update IK less frequently (every 2nd frame) for background characters
- Disable IK for characters outside camera view
- Use simpler constraints for distant characters

---

## Note

While FABRIK is a fast and versatile IK algorithm, the choice of algorithm largely depends on project needs.

FABRIK is popular for its stability and simplicity, but other approaches may offer more control, constraints, or support for more complex chains.

### Bitmoji 3D "Adapt to Mixamo" Incompatibility

**Important:** The "Adapt to Mixamo" feature in the Bitmoji 3D component is **incompatible** with this IK system.

**Why?**
- Mixamo adaptation modifies the scaling and rig configuration, interfering with this IK implementation.

**Error you'll see:**
```
ERROR: Adapt to Mixamo is enabled on left Bitmoji 3D component.
This feature is incompatible with the IK system. Please disable it in component settings.
```

**Solution:**
1. Select your Bitmoji 3D component (e.g., `LeftPlayerBitmojiRoot`)
2. In Inspector, find the "Bitmoji 3D" script
3. **Uncheck** "Adapt to Mixamo"

If you need Mixamo animations with IK, consider implementing a custom IK system that instead accomadates Mixamo rig adaptations.

---

## References

- **[FABRIK Paper](http://www.andreasaristidou.com/FABRIK.html)**: Aristidou, A., & Lasenby, J. (2011). "FABRIK: A fast, iterative solver for the Inverse Kinematics problem"

---

Built with 👻 by the Spectacles team