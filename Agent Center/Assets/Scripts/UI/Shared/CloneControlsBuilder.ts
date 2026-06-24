import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { HorizontalFrame } from "../Elements/HorizontalFrame";
import { createImage } from "./ImageFactory";
import { createTooltip } from "./UIBuilders";
import { CLOSE_TEXTURE, ICON_Z_OFFSET } from "./UIConstants";

const PLATE_TILT_RAD = -75.0 * (Math.PI / 180);

export interface CloneControlsCallbacks {
  onClose: () => void;
  onHoverEnter: () => void;
  onHoverExit: () => void;
}

export interface CloneControlsResult {
  closeObj: SceneObject;
  closeBtn: RoundButton;
  closeIconImage: Image;
  closeTooltip: Tooltip;
}

export function createCloneControls(
  frame: HorizontalFrame,
  callbacks: CloneControlsCallbacks,
): CloneControlsResult {
  const buttonWidth = 3;
  const iconSize = buttonWidth / 2;
  const margin = 0.5;
  const buttonZ = buttonWidth / 2 + 1;

  const halfW = frame.innerSize.x / 2;
  const halfH = frame.innerSize.y / 2;
  const contentInvRot = frame.content
    .getTransform()
    .getLocalRotation()
    .invert();

  const tiltInv = quat.fromEulerAngles(-PLATE_TILT_RAD, 0, 0);
  const uprightRot = contentInvRot.multiply(tiltInv);
  const forwardInContent = uprightRot.multiplyVec3(new vec3(0, 0, 1));

  const closeFrameX = -halfW + buttonWidth / 2 + margin;
  const frontY = -halfH;

  const closeObj = global.scene.createSceneObject("CloseButton");
  closeObj.setParent(frame.content);
  closeObj
    .getTransform()
    .setLocalPosition(
      contentInvRot.multiplyVec3(new vec3(closeFrameX, frontY, buttonZ)),
    );
  closeObj.getTransform().setLocalRotation(uprightRot);

  const closeBtn = closeObj.createComponent(
    RoundButton.getTypeName(),
  ) as RoundButton;
  closeBtn.initialize();
  closeBtn.width = buttonWidth;

  closeBtn.visual.hoveredPosition = forwardInContent;
  closeBtn.visual.triggeredPosition = forwardInContent.uniformScale(0.5);
  closeBtn.visual.toggledHoveredPosition = forwardInContent;
  closeBtn.visual.toggledTriggeredPosition = forwardInContent.uniformScale(0.5);

  const closeIconImage = createImage(CLOSE_TEXTURE, {
    parent: closeObj,
    name: "CloseIcon",
    position: new vec3(0, 0, ICON_Z_OFFSET),
    size: iconSize,
  });

  const closeTooltip = createTooltip(closeObj, "Close");

  closeBtn.onTriggerUp.add(callbacks.onClose);
  closeBtn.interactable.onHoverEnter.add(callbacks.onHoverEnter);
  closeBtn.interactable.onHoverExit.add(callbacks.onHoverExit);
  closeBtn.onHoverEnter.add(() => closeTooltip.setOn(true));
  closeBtn.onHoverExit.add(() => closeTooltip.setOn(false));

  frame.registerManagedObject(closeObj, (alpha) => {
    closeBtn.visual.renderMeshVisual.mainPass.opacityFactor = alpha;
    const c = closeIconImage.mainPass.baseColor;
    closeIconImage.mainPass.baseColor = new vec4(c.r, c.g, c.b, alpha);
  });

  return {
    closeObj,
    closeBtn,
    closeIconImage,
    closeTooltip,
  };
}
