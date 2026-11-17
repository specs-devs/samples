//@component
/**
 * SPECS Inc. 2027
 * SnapToLine - Snaps an object to the closest point on a line JavaScript version of the original C#
 * component
 */
//@input SceneObject lineStart {"hint":"The start point of the line"}
//@input SceneObject lineEnd {"hint":"The end point of the line"}
//@input SceneObject snappingObject {"hint":"The object that will snap to the line", "allowUndefined": true}
//@input SceneObject distanceObject {"hint":"The object used to measure distance to the line for snap detection", "allowUndefined": true}
//@input float snapDistance = 1.0 {"hint":"How close the object needs to be to snap to the line"}
//@input bool followWhenFar = true {"hint":"When the distance object is farther than snapDistance, the snapping object follows it, so you see where it is before it snaps"}
//@input vec3 followOffset = {0,0,0} {"hint":"World offset (cm) from the distance object while following, so the snapping object stays visible next to it"}
//@input Component.RenderMeshVisual snapColorVisual {"hint":"Optional visual that changes color when snapped (its material is cloned)", "allowUndefined": true}
//@input vec4 freeColor = {1,1,1,1} {"widget":"color", "hint":"Color while free"}
//@input vec4 snappedColor = {0.2,0.9,0.4,1} {"widget":"color", "hint":"Color while snapped to the line"}

// Store the closest point for visualization
let closestPointOnLine;

let snapped = null;
let colorMaterial = null;

function setSnapped(value) {
  if (value === snapped) return;
  snapped = value;
  if (colorMaterial) {
    colorMaterial.mainPass.baseColor = value ? script.snappedColor : script.freeColor;
  }
}

function onAwake() {
  if (script.snapColorVisual && script.snapColorVisual.mainMaterial) {
    colorMaterial = script.snapColorVisual.mainMaterial.clone();
    script.snapColorVisual.mainMaterial = colorMaterial;
  }
  script.createEvent("UpdateEvent").bind(() => {
    update();
  });
}

function update() {
  if (!script.lineStart || !script.lineEnd) {
    print("Warning: Line Start or Line End is not assigned!");
    return;
  }

  // Use script.sceneObject as fallback if snappingObject is not assigned
  const objectToSnap = script.snappingObject || script.sceneObject;

  // Use snappingObject as fallback for distanceObject if not assigned
  const objectForDistance = script.distanceObject || objectToSnap;

  // Get positions
  const distanceObjectPosition = objectForDistance.getTransform().getWorldPosition();
  const lineStartPosition = script.lineStart.getTransform().getWorldPosition();
  const lineEndPosition = script.lineEnd.getTransform().getWorldPosition();

  // Find the closest point on the line to the distance object
  closestPointOnLine = getClosestPointOnLine(distanceObjectPosition, lineStartPosition, lineEndPosition);

  // Check if the distance object is within the snap distance
  const distance = distanceObjectPosition.distance(closestPointOnLine);

  if (distance <= script.snapDistance) {
    // Snap the snapping object to the closest point on the line
    setSnapped(true);
    objectToSnap.getTransform().setWorldPosition(closestPointOnLine);
  } else {
    setSnapped(false);
    if (script.followWhenFar && objectForDistance !== objectToSnap) {
      objectToSnap.getTransform().setWorldPosition(distanceObjectPosition.add(script.followOffset));
    }
  }
}

/**
 * Calculate the closest point on a line to a given point
 */
function getClosestPointOnLine(point, lineStart, lineEnd) {
  // Calculate the line direction and length
  const lineDirection = lineEnd.sub(lineStart);
  const lineLength = lineDirection.length;
  const normalizedDirection = lineDirection.normalize();

  // Project the point onto the line
  const startToPoint = point.sub(lineStart);
  const projectionLength = startToPoint.dot(normalizedDirection);

  // Clamp the projection to the bounds of the line
  const clampedProjection = Math.max(0, Math.min(projectionLength, lineLength));

  // Calculate the closest point on the line
  return lineStart.add(normalizedDirection.scale(new vec3(clampedProjection, clampedProjection, clampedProjection)));
}

// Start the script
onAwake();
