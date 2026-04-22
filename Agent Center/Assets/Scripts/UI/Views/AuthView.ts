require("LensStudio:TextInputModule"); // eslint-disable-line @typescript-eslint/no-require-imports

import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { TextInputField } from "SpectaclesUIKit.lspkg/Scripts/Components/TextInputField/TextInputField";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createImage } from "../Shared/ImageFactory";
import { ICON_Z_OFFSET, CHEVRON_LEFT_TEXTURE, PANEL_WIDTH, TITLE_HEIGHT, PANEL_PADDING as PADDING, Z_CONTENT } from "../Shared/UIConstants";
import { createTooltip, createText } from "../Shared/UIBuilders";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { AuthType } from "../../Types";

const INPUT_HEIGHT = 4;
const INSTRUCTIONS_HEIGHT = 8;
const BUTTON_HEIGHT = 3;
const BUTTON_WIDTH = 12;
const STATUS_HEIGHT = 2.5;
const SECTION_GAP = 1.5;
const BACK_BTN_SIZE = 2.5;
const BACK_BTN_MARGIN = 0.5;

const API_KEY_INSTRUCTIONS =
  "Instructions:\n" +
  "1. Navigate to cursor.com/dashboard \u2192 Cloud Agents Tab \u2192 My Settings \u2192 User API Keys\n" +
  "2. Click New API Key\n" +
  '3. Give your key a descriptive name (e.g., "Usage Dashboard Integration")\n' +
  "4. Copy the generated key immediately - you won't see it again";

const PAIRING_CODE_INSTRUCTIONS =
  "Enter the 6-digit pairing code shown on your Computer.\n\n" +
  "1. Run the bridge sync script on your Computer\n" +
  "2. Find the pairing code displayed in the terminal\n" +
  "3. Enter the code below to connect";

export interface AuthSubmission {
  provider: string;
  apiKey: string;
}

export class AuthView {
  readonly sceneObject: SceneObject;
  readonly onAuthenticated = new Event<AuthSubmission>();
  readonly onBackRequested = new Event<void>();

  private titleText: Text;
  private instructionsText: Text;
  private instructionsObj: SceneObject;
  private inputField: TextInputField;
  private inputObj: SceneObject;
  private submitBtn: RectangleButton;
  private submitBtnText: Text;
  private statusText: Text;
  private backBtn: RoundButton;
  private backTooltip: Tooltip;
  private initialized = false;
  private activeProvider = "";
  private activeAuthType: AuthType = "apiKey";

  constructor(parent: SceneObject) {
    const innerWidth = PANEL_WIDTH - PADDING.x * 2;
    const contentHeight =
      TITLE_HEIGHT +
      INPUT_HEIGHT +
      INSTRUCTIONS_HEIGHT +
      BUTTON_HEIGHT +
      STATUS_HEIGHT +
      SECTION_GAP * 4;
    const totalHeight = contentHeight + PADDING.y * 2;

    this.sceneObject = global.scene.createSceneObject("AuthView");
    this.sceneObject.setParent(parent);
    this.sceneObject.enabled = false;

    const plateObj = global.scene.createSceneObject("AuthPlate");
    plateObj.setParent(this.sceneObject);
    const plate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    plate.style = "dark";
    plate.size = new vec2(PANEL_WIDTH, totalHeight);
    plateObj.getTransform().setLocalPosition(new vec3(0, totalHeight / 2, 0));

    const backBtnX = -PANEL_WIDTH / 2 + BACK_BTN_SIZE / 2 + BACK_BTN_MARGIN;
    const backBtnY = totalHeight - BACK_BTN_SIZE / 2 - BACK_BTN_MARGIN;
    const backBtnObj = global.scene.createSceneObject("BackBtn");
    backBtnObj.setParent(this.sceneObject);
    backBtnObj
      .getTransform()
      .setLocalPosition(new vec3(backBtnX, backBtnY, Z_CONTENT));
    this.backBtn = backBtnObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    this.backBtn.width = BACK_BTN_SIZE;

    const backIconSize = BACK_BTN_SIZE * 0.45;
    createImage(CHEVRON_LEFT_TEXTURE, {
      parent: backBtnObj,
      name: "BackIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: backIconSize,
    });

    this.backTooltip = createTooltip(backBtnObj, "Back");

    let cursorY = totalHeight - PADDING.y;

    cursorY -= TITLE_HEIGHT / 2;
    this.titleText = createText({
      parent: this.sceneObject,
      name: "AuthTitle",
      text: "",
      size: TextSize.XXL,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -TITLE_HEIGHT / 2,
        TITLE_HEIGHT / 2,
      ),
    });
    cursorY -= TITLE_HEIGHT / 2 + SECTION_GAP;

    cursorY -= INSTRUCTIONS_HEIGHT / 2;
    this.instructionsText = createText({
      parent: this.sceneObject,
      name: "Instructions",
      text: API_KEY_INSTRUCTIONS,
      size: TextSize.M,
      color: new vec4(1, 1, 1, 0.7),
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Top,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -INSTRUCTIONS_HEIGHT / 2,
        INSTRUCTIONS_HEIGHT / 2,
      ),
    });
    this.instructionsText.verticalOverflow = VerticalOverflow.Truncate;
    this.instructionsObj = this.instructionsText.getSceneObject();
    cursorY -= INSTRUCTIONS_HEIGHT / 2 + SECTION_GAP;

    this.inputObj = global.scene.createSceneObject("ApiKeyInput");
    this.inputObj.setParent(this.sceneObject);
    cursorY -= INPUT_HEIGHT / 2;
    this.inputObj
      .getTransform()
      .setLocalPosition(new vec3(0, cursorY, Z_CONTENT));
    this.inputField = this.inputObj.createComponent(
      TextInputField.getTypeName(),
    ) as TextInputField;
    this.inputField.size = new vec3(innerWidth, INPUT_HEIGHT, 0.5);
    cursorY -= INPUT_HEIGHT / 2 + SECTION_GAP;

    const btnObj = global.scene.createSceneObject("AuthenticateBtn");
    btnObj.setParent(this.sceneObject);
    cursorY -= BUTTON_HEIGHT / 2;
    btnObj.getTransform().setLocalPosition(new vec3(0, cursorY, Z_CONTENT));
    this.submitBtn = btnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    this.submitBtn.size = new vec3(BUTTON_WIDTH, BUTTON_HEIGHT, 0.5);
    cursorY -= BUTTON_HEIGHT / 2 + SECTION_GAP;

    this.submitBtnText = createText({
      parent: btnObj,
      name: "AuthBtnLabel",
      text: "Authenticate",
      size: TextSize.S,
      font: TextFont.SemiBold,
      position: new vec3(0, 0, ICON_Z_OFFSET),
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -BUTTON_WIDTH / 2 + 0.3,
        BUTTON_WIDTH / 2 - 0.3,
        -BUTTON_HEIGHT / 2,
        BUTTON_HEIGHT / 2,
      ),
    });

    cursorY -= STATUS_HEIGHT / 2;
    this.statusText = createText({
      parent: this.sceneObject,
      name: "AuthStatus",
      text: "",
      size: TextSize.S,
      color: new vec4(1, 1, 1, 0.5),
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -STATUS_HEIGHT / 2,
        STATUS_HEIGHT / 2,
      ),
    });
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.backBtn.initialize();
    this.backBtn.onTriggerUp.add(() => this.onBackRequested.invoke());
    this.backBtn.onHoverEnter.add(() => this.backTooltip.setOn(true));
    this.backBtn.onHoverExit.add(() => this.backTooltip.setOn(false));

    this.inputField.initialize();
    this.inputField.placeholderText = "Insert User API Key";
    this.inputField.text = "";

    this.submitBtn.initialize();

    this.submitBtn.onTriggerUp.add(() => this.handleSubmit());
  }

  showForProvider(
    agentName: string,
    provider: string,
    authType: AuthType = "apiKey",
  ): void {
    this.activeProvider = provider;
    this.activeAuthType = authType;
    this.titleText.text = `Connect to ${agentName}`;
    this.statusText.text = "";
    this.sceneObject.enabled = true;

    this.inputField.inputType =
      authType === "pairingCode" ? "numeric" : "default";
    this.initialize();
    this.updateKeyboardType(
      authType === "pairingCode"
        ? TextInputSystem.KeyboardType.Num
        : TextInputSystem.KeyboardType.Text,
    );

    if (authType === "pairingCode") {
      this.instructionsText.text = PAIRING_CODE_INSTRUCTIONS;
      this.inputObj.enabled = true;
      this.inputField.text = "";
      this.inputField.placeholderText = "Enter 6-digit code";
      this.submitBtnText.text = "Pair";
    } else {
      this.instructionsText.text = API_KEY_INSTRUCTIONS;
      this.inputObj.enabled = true;
      this.inputField.text = "";
      this.submitBtnText.text = "Authenticate";
    }
  }

  setStatus(message: string, isError: boolean = false): void {
    this.statusText.text = message;
    this.statusText.textFill.color = isError
      ? new vec4(1, 0.4, 0.4, 1)
      : new vec4(0.4, 1, 0.6, 1);
  }

  // TextInputField only reads inputType during initialize(), so after the
  // first call we need to patch the live keyboard options directly.
  private updateKeyboardType(type: number): void {
    const internal = this.inputField as unknown as {
      keyboardOptions: TextInputSystem.KeyboardOptions;
    };
    internal.keyboardOptions.keyboardType = type;
  }

  private handleSubmit(): void {
    const apiKey = this.inputField.text.trim();
    if (!apiKey) {
      const errorMsg =
        this.activeAuthType === "pairingCode"
          ? "Please enter the pairing code"
          : "Please enter an API key";
      this.setStatus(errorMsg, true);
      return;
    }
    const statusMsg =
      this.activeAuthType === "pairingCode"
        ? "Pairing..."
        : "Authenticating...";
    this.setStatus(statusMsg);
    this.onAuthenticated.invoke({ provider: this.activeProvider, apiKey });
  }
}
