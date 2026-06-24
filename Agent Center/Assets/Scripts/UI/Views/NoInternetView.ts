import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createText } from "../Shared/UIBuilders";
import { PANEL_WIDTH, TITLE_HEIGHT, PANEL_PADDING as PADDING, Z_CONTENT } from "../Shared/UIConstants";

export class NoInternetView {
  readonly sceneObject: SceneObject;

  constructor(parent: SceneObject) {
    const innerWidth = PANEL_WIDTH - PADDING.x * 2;
    const subtextHeight = 2;
    const contentHeight = TITLE_HEIGHT + subtextHeight;
    const totalHeight = contentHeight + PADDING.y * 2;

    this.sceneObject = global.scene.createSceneObject("NoInternetView");
    this.sceneObject.setParent(parent);

    const plateObj = global.scene.createSceneObject("NoInternetPlate");
    plateObj.setParent(this.sceneObject);
    const plate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    plate.style = "dark";
    plate.size = new vec2(PANEL_WIDTH, totalHeight);
    plateObj
      .getTransform()
      .setLocalPosition(new vec3(0, totalHeight / 2, 0));

    let cursorY = totalHeight - PADDING.y;

    cursorY -= TITLE_HEIGHT / 2;
    createText({
      parent: this.sceneObject,
      name: "NoInternetText",
      text: "No Internet Connection",
      size: TextSize.XXL,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 0.75),
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -TITLE_HEIGHT / 2,
        TITLE_HEIGHT / 2,
      ),
    });
    cursorY -= TITLE_HEIGHT / 2;

    cursorY -= subtextHeight / 2;
    createText({
      parent: this.sceneObject,
      name: "NoInternetSubtext",
      text: "Check your internet connection to continue.",
      size: TextSize.M,
      color: new vec4(1, 1, 1, 0.35),
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Top,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -subtextHeight / 2,
        subtextHeight / 2,
      ),
    });

    this.sceneObject.enabled = false;
  }
}
