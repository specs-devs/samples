import { BackPlate } from "UIKit.lspkg/Scripts/BackPlate";
import { createText } from "../Shared/UIBuilders";
import { PANEL_WIDTH, TITLE_HEIGHT, PANEL_PADDING as PADDING, Z_CONTENT } from "../Shared/UIConstants";
import { TextStyle, TextColor } from "../Shared/UIStyle";

export class SupabaseConfigMissingView {
  readonly sceneObject: SceneObject;

  constructor(parent: SceneObject) {
    const innerWidth = PANEL_WIDTH - PADDING.x * 2;
    const subtextHeight = 3;
    const contentHeight = TITLE_HEIGHT + subtextHeight;
    const totalHeight = contentHeight + PADDING.y * 2;

    this.sceneObject = global.scene.createSceneObject("SupabaseConfigMissingView");
    this.sceneObject.setParent(parent);

    const plateObj = global.scene.createSceneObject("SupabaseConfigMissingPlate");
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
      name: "SupabaseConfigMissingText",
      text: "Supabase Not Configured",
      style: TextStyle.PanelTitle,
      color: TextColor.Secondary,
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
      layoutRect: Rect.create(
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
      name: "SupabaseConfigMissingSubtext",
      text: "Open SupabaseProject.supabaseProject in Lens Studio and set the Project URL and Public Token to connect.",
      style: TextStyle.Body,
      color: TextColor.Muted,
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Top,
      layoutRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -subtextHeight / 2,
        subtextHeight / 2,
      ),
    });

    this.sceneObject.enabled = false;
  }
}
