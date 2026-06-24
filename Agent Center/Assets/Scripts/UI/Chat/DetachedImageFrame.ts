import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame";
import { createImage } from "../Shared/ImageFactory";

const FRAME_MAX_SIDE = 20;

export function spawnDetachedImageFrame(
  texture: Texture,
  worldPosition: vec3,
  worldRotation: quat,
  parent: SceneObject,
  onClose: (frameHost: SceneObject) => void,
): SceneObject {
  const tw = texture.getWidth();
  const th = texture.getHeight();
  const aspect = th / Math.max(tw, 1);
  let frameW: number;
  let frameH: number;
  if (aspect <= 1) {
    frameW = FRAME_MAX_SIDE;
    frameH = FRAME_MAX_SIDE * aspect;
  } else {
    frameH = FRAME_MAX_SIDE;
    frameW = FRAME_MAX_SIDE / aspect;
  }

  const frameHost = global.scene.createSceneObject("DetachedImageFrame");
  frameHost.setParent(parent);
  frameHost.getTransform().setWorldPosition(worldPosition);
  frameHost.getTransform().setWorldRotation(worldRotation);

  const frame = frameHost.createComponent(Frame.getTypeName()) as Frame;
  frame.autoShowHide = true;
  frame.allowScaling = true;
  frame.autoScaleContent = true;
  const frameRecord = frame as unknown as Record<string, boolean>;
  frameRecord["useBillboarding"] = true;
  frame.initialize();
  frame.innerSize = new vec2(frameW, frameH);
  frame.showCloseButton = true;
  frame.showFollowButton = false;

  let img = createImage(texture, {
    parent: null,
    name: "DetachedImage",
    scale: new vec3(frameW, frameH, 1),
    position: new vec3(0, 0, 0),
    shared: false,
  });

  let imgObj = img.getSceneObject();
  imgObj.setParentPreserveWorldTransform(frame.content);
  imgObj.getTransform().setLocalPosition(new vec3(0, 0, 0.5));
  imgObj.getTransform().setLocalRotation(quat.quatIdentity());

  frame.closeButton.onTriggerUp.add(() => onClose(frameHost));

  return frameHost;
}
