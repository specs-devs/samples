/**
 * Adds a visible text label as a child of a button SceneObject.
 * Matches the reference UIManager setup: child "Content" object at z=0
 * with solid-white Text component using worldSpaceRect for bounds.
 */
export function addButtonLabel(
  btnObj: SceneObject,
  label: string,
  btnWidth: number,
  btnHeight: number
): Text {
  const textObj = global.scene.createSceneObject("Content")
  textObj.setParent(btnObj)
  textObj.getTransform().setLocalPosition(new vec3(0, 0, 0.1))

  const textComp = textObj.createComponent("Component.Text") as Text
  textComp.text = label
  textComp.size = 48
  const halfW = btnWidth / 2 - 0.5
  const halfH = btnHeight / 2 - 0.5
  textComp.worldSpaceRect = Rect.create(-halfW, halfW, -halfH, halfH)
  textComp.horizontalOverflow = HorizontalOverflow.Wrap
  textComp.verticalOverflow = VerticalOverflow.Overflow
  textComp.horizontalAlignment = HorizontalAlignment.Center
  textComp.verticalAlignment = VerticalAlignment.Center
  textComp.textFill.mode = TextFillMode.Solid
  textComp.textFill.color = new vec4(1, 1, 1, 1)
  textComp.renderOrder = 10

  return textComp
}
