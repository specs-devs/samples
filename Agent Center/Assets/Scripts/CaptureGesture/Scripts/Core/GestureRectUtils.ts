export interface RectCorners {
  topLeft: vec3;
  topRight: vec3;
  bottomLeft: vec3;
  bottomRight: vec3;
}

export interface RectPose {
  center: vec3;
  rotation: quat;
  scale: vec2;
}

export function computeCornersFromSingleHand(
  pinchStartPos: vec3,
  pinchCurrPos: vec3,
  camTrans: Transform,
  isLeftHand: boolean
): RectCorners {
  // find center and directions
  const camPos = camTrans.getWorldPosition();
  const centerPos = pinchStartPos.add(pinchCurrPos).uniformScale(0.5);
  const directionToCenter = camPos.sub(centerPos).normalize();
  const right = camTrans.up.cross(directionToCenter).normalize();
  const width = getWidth(pinchStartPos, pinchCurrPos, camTrans);

  //define points to form a rectangle relative to worldCameraForward
  let topLeft = pinchStartPos;
  let bottomRight = pinchCurrPos;
  let topRight = topLeft.add(right.uniformScale(width)); // Add width along the X-axis
  let bottomLeft = bottomRight.add(right.uniformScale(-width)); // Subtract height along the Y-axis

  //handle right pinch starting from bottom
  var isStartPinchHigher = pinchStartPos.y > pinchCurrPos.y;
  if (!isStartPinchHigher) {
    bottomLeft = pinchStartPos;
    topRight = pinchCurrPos;
    topLeft = topRight.add(right.uniformScale(-width));
    bottomRight = bottomLeft.add(right.uniformScale(width));
  }

  if (isLeftHand) {
    topRight = pinchStartPos;
    bottomLeft = pinchCurrPos;
    topLeft = topRight.add(right.uniformScale(-width));
    bottomRight = bottomLeft.add(right.uniformScale(width));
    //handle left pinch starting from bottom
    if (!isStartPinchHigher) {
      bottomRight = pinchStartPos;
      topLeft = pinchCurrPos;
      topRight = topLeft.add(right.uniformScale(width));
      bottomLeft = bottomRight.add(right.uniformScale(-width));
    }
  }

  return {topLeft, topRight, bottomLeft, bottomRight};
}

export function computeCornersFromTwoHands(leftPos: vec3, rightPos: vec3, camTrans: Transform): RectCorners {
  let topLeft = leftPos;
  let bottomRight = rightPos;

  var isLeftHigher = leftPos.y > rightPos.y;

  //set top left and bottom right to both pinch positions
  var centerPos = topLeft.add(bottomRight).uniformScale(0.5);
  var camPos = camTrans.getWorldPosition();
  var directionToCenter = camPos.sub(centerPos).normalize();
  var right = camTrans.up.cross(directionToCenter).normalize();

  //set top right and bottom left to remaining points to form a rectangle relative to worldCameraForward
  let topRight = topLeft.add(right.uniformScale(getWidth(topLeft, bottomRight, camTrans))); // Add width along the X-axis
  let bottomLeft = bottomRight.add(right.uniformScale(-getWidth(topLeft, bottomRight, camTrans)));

  if (!isLeftHigher) {
    topRight = rightPos;
    bottomLeft = leftPos;

    centerPos = topRight.add(bottomLeft).uniformScale(0.5);
    directionToCenter = camPos.sub(centerPos).normalize();
    var left = camTrans.up.cross(directionToCenter).normalize().uniformScale(-1);

    //set top right and bottom left to remaining points to form a rectangle relative to worldCameraForward
    topLeft = topRight.add(left.uniformScale(getWidth(topRight, bottomLeft, camTrans))); // Add width along the X-axis
    bottomRight = bottomLeft.add(left.uniformScale(-getWidth(topRight, bottomLeft, camTrans)));
  }
  return {topLeft, topRight, bottomLeft, bottomRight};
}

/**
 * Compute center, rotation, and scale from rectangle corners.
 */
export function computePoseFromCorners(corners: RectCorners): RectPose {
  const {topLeft, topRight, bottomLeft, bottomRight} = corners;

  const rectRight = topRight.sub(topLeft).normalize();
  const rectUp = topLeft.sub(bottomLeft).normalize();
  const rectForward = rectRight.cross(rectUp).normalize();

  const rotMat = new mat3();
  rotMat.column0 = rectRight;
  rotMat.column1 = rectUp;
  rotMat.column2 = rectForward;
  const rotation = quat.fromRotationMat(rotMat);

  const center = topLeft.add(bottomRight).uniformScale(0.5);
  const scaleWidth = topLeft.distance(topRight);
  const scaleHeight = topLeft.distance(bottomLeft);
  const scale = new vec2(scaleWidth, scaleHeight);

  return {center, rotation, scale};
}

export function localTopLeft(topLeftWorldPos: vec3, camTrans: Transform) {
  return camTrans.getInvertedWorldTransform().multiplyPoint(topLeftWorldPos);
}

export function localBottomRight(bottomRightWorldPos: vec3, camTrans: Transform) {
  return camTrans.getInvertedWorldTransform().multiplyPoint(bottomRightWorldPos);
}

export function getWidth(topLeftWorldPos: vec3, bottomRightWorldPos: vec3, camTrans: Transform) {
  return Math.abs(localBottomRight(bottomRightWorldPos, camTrans).x - localTopLeft(topLeftWorldPos, camTrans).x);
}

export function getHeight(topLeftWorldPos: vec3, bottomRightWorldPos: vec3, camTrans: Transform) {
  return Math.abs(localBottomRight(bottomRightWorldPos, camTrans).y - localTopLeft(topLeftWorldPos, camTrans).y);
}
