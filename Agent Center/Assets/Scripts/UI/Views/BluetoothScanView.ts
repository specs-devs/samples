import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { ScrollWindow } from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createText, createVerticalScrollBar, initializeScrollWindow } from "../Shared/UIBuilders";
import { createImage } from "../Shared/ImageFactory";
import { ICON_Z_OFFSET, CHEVRON_LEFT_TEXTURE, PANEL_WIDTH, TITLE_HEIGHT, PANEL_PADDING as PADDING, Z_CONTENT, SCROLLBAR_GAP } from "../Shared/UIConstants";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { LoadingSpinner } from "../../../Visuals/LoadingSpinner/LoadingSpinner";
import { BluetoothDeviceInfo } from "../../Bluetooth/BLEKeyboardManager";

const SPINNER_HEIGHT = 4;   // height of the spinner circle area
const STATUS_TEXT_HEIGHT = 2;
const SPINNER_ROW_HEIGHT = SPINNER_HEIGHT + STATUS_TEXT_HEIGHT; // 6
const ROW_HEIGHT = 3;
const BTN_WIDTH = 8;
const SECTION_GAP = 1.5;
const SCROLL_WINDOW_HEIGHT = 15;
const BACK_BTN_SIZE = 2.5;
const BACK_BTN_MARGIN = 0.5;
const SPINNER_SIZE = 3;

export class BluetoothScanView {
  readonly sceneObject: SceneObject;
  readonly onBackRequested = new Event<void>();
  readonly onPairRequested = new Event<Uint8Array>();

  private scrollWindow: ScrollWindow;
  private spinnerRowObj: SceneObject;
  private spinnerObj: SceneObject;
  private spinner: LoadingSpinner;
  private statusText: Text;
  private deviceRows: Array<{ obj: SceneObject; address: Uint8Array }> = [];
  private backBtn: RoundButton;
  private innerWidth: number;
  private initialized = false;

  constructor(parent: SceneObject) {
    this.innerWidth = PANEL_WIDTH - PADDING.x * 2;
    const totalHeight =
      TITLE_HEIGHT + SCROLL_WINDOW_HEIGHT + SECTION_GAP + PADDING.y * 2;

    this.sceneObject = global.scene.createSceneObject("BluetoothScanView");
    this.sceneObject.setParent(parent);

    const plateObj = global.scene.createSceneObject("BTScanPlate");
    plateObj.setParent(this.sceneObject);
    const plate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    plate.style = "dark";
    plate.size = new vec2(PANEL_WIDTH, totalHeight);
    plateObj.getTransform().setLocalPosition(new vec3(0, totalHeight / 2, 0));

    // Back button — top-left corner
    const backBtnX = -PANEL_WIDTH / 2 + BACK_BTN_SIZE / 2 + BACK_BTN_MARGIN;
    const backBtnY = totalHeight - BACK_BTN_SIZE / 2 - BACK_BTN_MARGIN;
    const backBtnObj = global.scene.createSceneObject("BTScanBackBtn");
    backBtnObj.setParent(this.sceneObject);
    backBtnObj
      .getTransform()
      .setLocalPosition(new vec3(backBtnX, backBtnY, Z_CONTENT));
    this.backBtn = backBtnObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    this.backBtn.width = BACK_BTN_SIZE;
    createImage(CHEVRON_LEFT_TEXTURE, {
      parent: backBtnObj,
      name: "BackIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: BACK_BTN_SIZE * 0.45,
    });

    // Title
    let cursorY = totalHeight - PADDING.y;
    cursorY -= TITLE_HEIGHT / 2;
    createText({
      parent: this.sceneObject,
      name: "BTScanTitle",
      text: "Bluetooth Keyboard",
      size: TextSize.XXL,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -this.innerWidth / 2,
        this.innerWidth / 2,
        -TITLE_HEIGHT / 2,
        TITLE_HEIGHT / 2,
      ),
    });
    cursorY -= TITLE_HEIGHT / 2 + SECTION_GAP;

    // Scroll window for spinner + device list
    const scrollAnchor = global.scene.createSceneObject("BTScanScrollAnchor");
    scrollAnchor.setParent(this.sceneObject);
    scrollAnchor
      .getTransform()
      .setLocalPosition(
        new vec3(0, cursorY - SCROLL_WINDOW_HEIGHT / 2, Z_CONTENT),
      );

    const scrollObj = global.scene.createSceneObject("BTScanScroll");
    scrollObj.setParent(scrollAnchor);
    scrollObj.getTransform().setLocalPosition(vec3.zero());

    this.scrollWindow = scrollObj.createComponent(
      ScrollWindow.getTypeName(),
    ) as ScrollWindow;
    this.scrollWindow.vertical = true;
    this.scrollWindow.horizontal = false;
    this.scrollWindow.windowSize = new vec2(
      this.innerWidth,
      SCROLL_WINDOW_HEIGHT,
    );
    this.scrollWindow.scrollDimensions = new vec2(
      this.innerWidth,
      SCROLL_WINDOW_HEIGHT,
    );

    createVerticalScrollBar(
      scrollAnchor,
      this.scrollWindow,
      new vec3(this.innerWidth / 2 + SCROLLBAR_GAP, 0, 0),
    );

    // Spinner row (always present, repositioned by relayout)
    this.spinnerRowObj = global.scene.createSceneObject("BTScanSpinnerRow");
    this.scrollWindow.addObject(this.spinnerRowObj);

    // Spinner centered, in the top portion of the row
    const spinnerY = SPINNER_ROW_HEIGHT / 2 - SPINNER_HEIGHT / 2;
    this.spinnerObj = global.scene.createSceneObject("BTSpinner");
    this.spinnerObj.setParent(this.spinnerRowObj);
    this.spinnerObj
      .getTransform()
      .setLocalScale(new vec3(SPINNER_SIZE, SPINNER_SIZE, 1));
    this.spinnerObj
      .getTransform()
      .setLocalPosition(new vec3(0, spinnerY, Z_CONTENT));
    this.spinner = this.spinnerObj.createComponent(
      LoadingSpinner.getTypeName(),
    ) as LoadingSpinner;
    this.spinner.renderOrder = 1;

    // Status text below the spinner
    const textY = SPINNER_ROW_HEIGHT / 2 - SPINNER_HEIGHT - STATUS_TEXT_HEIGHT / 2;
    this.statusText = createText({
      parent: this.spinnerRowObj,
      name: "BTScanStatusText",
      text: "Scanning...",
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 0.7),
      position: new vec3(0, textY, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -this.innerWidth / 2,
        this.innerWidth / 2,
        -STATUS_TEXT_HEIGHT / 2,
        STATUS_TEXT_HEIGHT / 2,
      ),
    });

    this.relayout();
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    initializeScrollWindow(this.scrollWindow);
    this.scrollWindow.scrollPositionNormalized = new vec2(0, 1);

    this.backBtn.initialize();
    this.backBtn.onTriggerUp.add(() => this.onBackRequested.invoke());
  }

  setScanning(scanning: boolean): void {
    this.spinnerObj.enabled = scanning;
    this.statusText.text = scanning
      ? "Scanning..."
      : this.deviceRows.length === 0
        ? "No devices found."
        : "Select a device to pair.";
    for (const row of this.deviceRows) {
      row.obj.enabled = !scanning;
    }
  }

  setConnecting(deviceName: string): void {
    this.spinnerObj.enabled = true;
    this.statusText.text = `Connecting to ${deviceName}...`;
    for (const row of this.deviceRows) {
      row.obj.enabled = false;
    }
  }

  addDevice(device: BluetoothDeviceInfo): void {
    const i = this.deviceRows.length;
    const deviceLabelWidth = this.innerWidth - BTN_WIDTH - 1;
    const pairBtnX = this.innerWidth / 2 - BTN_WIDTH / 2;
    const pairTextWidth = BTN_WIDTH - 1.2;

    const rowObj = global.scene.createSceneObject(`BTDevice_${i}`);
    this.scrollWindow.addObject(rowObj);

    createText({
      parent: rowObj,
      name: `BTDeviceLabel_${i}`,
      text: device.name,
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(-this.innerWidth / 2 + deviceLabelWidth / 2, 0, 0),
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(
        -deviceLabelWidth / 2,
        deviceLabelWidth / 2,
        -ROW_HEIGHT / 2,
        ROW_HEIGHT / 2,
      ),
    });

    const pairBtnObj = global.scene.createSceneObject(`BTDevicePairBtn_${i}`);
    pairBtnObj.setParent(rowObj);
    pairBtnObj.getTransform().setLocalPosition(new vec3(pairBtnX, 0, 0));
    const pairBtn = pairBtnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    pairBtn.size = new vec3(BTN_WIDTH, ROW_HEIGHT - 0.5, 0.5);
    createText({
      parent: pairBtnObj,
      name: `BTDevicePairLabel_${i}`,
      text: "Pair",
      size: TextSize.S,
      font: TextFont.SemiBold,
      position: new vec3(0, 0, ICON_Z_OFFSET),
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -pairTextWidth / 2,
        pairTextWidth / 2,
        -ROW_HEIGHT / 2,
        ROW_HEIGHT / 2,
      ),
    });

    const address = device.address;
    pairBtn.initialize();
    pairBtn.onTriggerUp.add(() => this.onPairRequested.invoke(address));

    this.deviceRows.push({ obj: rowObj, address: device.address });
    this.relayout();
  }

  clearDevices(): void {
    for (const row of this.deviceRows) {
      row.obj.destroy();
    }
    this.deviceRows = [];
    this.relayout();
  }

  getTotalHeight(): number {
    return TITLE_HEIGHT + SCROLL_WINDOW_HEIGHT + SECTION_GAP + PADDING.y * 2;
  }

  private relayout(): void {
    const contentHeight =
      SPINNER_ROW_HEIGHT + this.deviceRows.length * ROW_HEIGHT;
    const scrollH = Math.max(contentHeight, SCROLL_WINDOW_HEIGHT);

    this.scrollWindow.scrollDimensions = new vec2(this.innerWidth, scrollH);
    this.scrollWindow.scrollPositionNormalized = new vec2(0, 1);

    // Position spinner row at the top of the scroll content
    const topY = scrollH / 2;
    this.spinnerRowObj
      .getTransform()
      .setLocalPosition(new vec3(0, topY - SPINNER_ROW_HEIGHT / 2, 0));

    // Device rows below spinner
    for (let i = 0; i < this.deviceRows.length; i++) {
      const rowY =
        topY - SPINNER_ROW_HEIGHT - i * ROW_HEIGHT - ROW_HEIGHT / 2;
      this.deviceRows[i].obj
        .getTransform()
        .setLocalPosition(new vec3(0, rowY, 0));
    }
  }
}
