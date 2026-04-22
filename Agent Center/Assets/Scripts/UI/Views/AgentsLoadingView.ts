import { LoadingSpinner } from "../../../Visuals/LoadingSpinner/LoadingSpinner";
import { TextSize } from "../Shared/TextSizes";
import { createText } from "../Shared/UIBuilders";
import { PANEL_WIDTH, PANEL_PADDING as PADDING, Z_CONTENT } from "../Shared/UIConstants";
const SPINNER_SIZE = 3;
const SPINNER_HEIGHT = 4;
const TEXT_HEIGHT = 2;

export class AgentsLoadingView {
  readonly sceneObject: SceneObject;
  private spinner: LoadingSpinner;

  constructor(parent: SceneObject) {
    const innerWidth = PANEL_WIDTH - PADDING.x * 2;
    const contentHeight = SPINNER_HEIGHT + TEXT_HEIGHT;
    const totalHeight = contentHeight + PADDING.y * 2;

    this.sceneObject = global.scene.createSceneObject("AgentsLoadingView");
    this.sceneObject.setParent(parent);

    let cursorY = totalHeight - PADDING.y;

    cursorY -= SPINNER_HEIGHT / 2;
    const spinnerObj = global.scene.createSceneObject("LoadingSpinner");
    spinnerObj.setParent(this.sceneObject);
    spinnerObj
      .getTransform()
      .setLocalPosition(new vec3(0, cursorY, Z_CONTENT));
    spinnerObj
      .getTransform()
      .setLocalScale(new vec3(SPINNER_SIZE, SPINNER_SIZE, 1));
    this.spinner = spinnerObj.createComponent(
      LoadingSpinner.getTypeName(),
    ) as LoadingSpinner;
    this.spinner.renderOrder = 1;
    cursorY -= SPINNER_HEIGHT / 2;

    cursorY -= TEXT_HEIGHT / 2;
    createText({
      parent: this.sceneObject,
      name: "ConnectingText",
      text: "Connecting to Bridge...",
      size: TextSize.M,
      color: new vec4(1, 1, 1, 0.5),
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Center,
      verticalAlignment: VerticalAlignment.Center,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -TEXT_HEIGHT / 2,
        TEXT_HEIGHT / 2,
      ),
    });

    this.sceneObject.enabled = false;
  }

  concealSpinner(): void {
    this.spinner.conceal();
  }
}
