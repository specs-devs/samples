import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { ScrollWindow } from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { RectangleButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RectangleButton";
import { Switch } from "SpectaclesUIKit.lspkg/Scripts/Components/Switch/Switch";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createText, createVerticalScrollBar, initializeScrollWindow } from "../Shared/UIBuilders";
import { createImage } from "../Shared/ImageFactory";
import { ICON_Z_OFFSET, PANEL_WIDTH, TITLE_HEIGHT, Z_CONTENT, SCROLLBAR_GAP } from "../Shared/UIConstants";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { AuthType } from "../../Types";

const ADD_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/link.png",
) as Texture;

const DELETE_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Trash.png",
) as Texture;

const BLUETOOTH_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Bluetooth.png",
) as Texture;

const BLUETOOTH_OFF_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/Bluetooth-off.png",
) as Texture;

const SECTION_HEADER_HEIGHT = 2;
const ROW_HEIGHT = 3;
const BTN_WIDTH = 8;
const SWITCH_WIDTH = 5;
const DESC_HEIGHT = 2;
const SECTION_GAP = 1.5;
const PADDING = new vec2(3, 2);
const SCROLL_WINDOW_HEIGHT = 15;

export type { AuthType };

export interface AgentEntry {
  name: string;
  provider: string;
  description: string;
  authType: AuthType;
  alwaysConnect?: boolean;
}

export class SettingsListView {
  readonly sceneObject: SceneObject;
  readonly onConnectRequested = new Event<{
    name: string;
    provider: string;
    authType: AuthType;
  }>();
  readonly onDisconnectRequested = new Event<{
    name: string;
    provider: string;
  }>();
  readonly onDeleteAllDataRequested = new Event<void>();
  readonly onBluetoothScanRequested = new Event<void>();
  readonly onBluetoothUnpairRequested = new Event<void>();

  private addBtn: RectangleButton;
  private deleteBtn: RectangleButton;
  private scanBtn: RectangleButton;
  private toggleSwitch: Switch;
  private scrollWindow: ScrollWindow;
  private agents: AgentEntry[];
  private _continueLastTopic = true;

  private btStatusLabel: Text;
  private scanBtnLabel: Text;
  private scanBtnIcon: Image;
  private _btConnected = false;

  constructor(parent: SceneObject, agents: AgentEntry[]) {
    this.agents = agents;
    const innerWidth = PANEL_WIDTH - PADDING.x * 2;
    const totalHeight =
      TITLE_HEIGHT + SCROLL_WINDOW_HEIGHT + SECTION_GAP + PADDING.y * 2;

    const sectionBlock = SECTION_HEADER_HEIGHT + ROW_HEIGHT + DESC_HEIGHT;
    const scrollContentHeight =
      sectionBlock +
      SECTION_GAP +
      sectionBlock +
      SECTION_GAP +
      sectionBlock +
      SECTION_GAP +
      sectionBlock;

    this.sceneObject = global.scene.createSceneObject("ListView");
    this.sceneObject.setParent(parent);

    const plateObj = global.scene.createSceneObject("ListPlate");
    plateObj.setParent(this.sceneObject);
    const plate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    plate.style = "dark";
    plate.size = new vec2(PANEL_WIDTH, totalHeight);
    plateObj.getTransform().setLocalPosition(new vec3(0, totalHeight / 2, 0));

    let cursorY = totalHeight - PADDING.y;

    cursorY -= TITLE_HEIGHT / 2;
    createText({
      parent: this.sceneObject,
      name: "ListTitle",
      text: "Settings",
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

    const scrollAnchor = global.scene.createSceneObject("ScrollAnchor");
    scrollAnchor.setParent(this.sceneObject);
    scrollAnchor
      .getTransform()
      .setLocalPosition(
        new vec3(0, cursorY - SCROLL_WINDOW_HEIGHT / 2, Z_CONTENT),
      );

    const scrollObj = global.scene.createSceneObject("SettingsScroll");
    scrollObj.setParent(scrollAnchor);
    scrollObj.getTransform().setLocalPosition(vec3.zero());

    this.scrollWindow = scrollObj.createComponent(
      ScrollWindow.getTypeName(),
    ) as ScrollWindow;
    this.scrollWindow.vertical = true;
    this.scrollWindow.horizontal = false;
    this.scrollWindow.windowSize = new vec2(innerWidth, SCROLL_WINDOW_HEIGHT);
    this.scrollWindow.scrollDimensions = new vec2(
      innerWidth,
      Math.max(scrollContentHeight, SCROLL_WINDOW_HEIGHT),
    );

    createVerticalScrollBar(
      scrollAnchor,
      this.scrollWindow,
      new vec3(innerWidth / 2 + SCROLLBAR_GAP, 0, 0),
    );

    let itemY = scrollContentHeight / 2;

    // --- Section: Connect New Agent ---
    itemY = this.buildSectionHeader(
      "ConnectHeader",
      "Connect New Agent",
      innerWidth,
      itemY,
    );

    itemY -= ROW_HEIGHT / 2;
    const connectRowObj = global.scene.createSceneObject("ConnectRow");
    this.scrollWindow.addObject(connectRowObj);
    connectRowObj.getTransform().setLocalPosition(new vec3(0, itemY, 0));

    const labelWidth = innerWidth - BTN_WIDTH - 1;
    this.buildRowLabel(connectRowObj, "ConnectLabel", "Local Agent", labelWidth);

    const addBtnObj = global.scene.createSceneObject("AddAgentBtn");
    addBtnObj.setParent(connectRowObj);
    const btnX = innerWidth / 2 - BTN_WIDTH / 2;
    addBtnObj.getTransform().setLocalPosition(new vec3(btnX, 0, 0));
    this.addBtn = addBtnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    this.addBtn.size = new vec3(BTN_WIDTH, ROW_HEIGHT - 0.5, 0.5);

    const iconSize = (ROW_HEIGHT - 0.5) * 0.45;
    const iconX = -BTN_WIDTH / 2 + iconSize / 2 + 0.6;
    createImage(ADD_TEXTURE, {
      parent: addBtnObj,
      name: "AddIcon",
      position: new vec3(iconX, 0, ICON_Z_OFFSET),
      size: iconSize,
    });

    const connectTextOffset = iconSize / 2 + 0.2;
    const connectTextWidth = BTN_WIDTH - iconSize - 1.2;
    createText({
      parent: addBtnObj,
      name: "ConnectBtnLabel",
      text: "Connect",
      size: TextSize.S,
      font: TextFont.SemiBold,
      position: new vec3(connectTextOffset, 0, ICON_Z_OFFSET),
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -connectTextWidth / 2,
        connectTextWidth / 2,
        -ROW_HEIGHT / 2,
        ROW_HEIGHT / 2,
      ),
    });
    itemY -= ROW_HEIGHT / 2;

    itemY = this.buildDescText(
      "ConnectDesc",
      "Run the spectacles-agent-bridge on your computer, then tap to enter your pairing code.",
      innerWidth,
      itemY,
    );

    itemY -= SECTION_GAP;

    // --- Section: Voice Notes ---
    itemY = this.buildSectionHeader(
      "VoiceNotesHeader",
      "Voice Notes",
      innerWidth,
      itemY,
    );

    itemY -= ROW_HEIGHT / 2;
    const toggleRowObj = global.scene.createSceneObject("VoiceNoteToggleRow");
    this.scrollWindow.addObject(toggleRowObj);
    toggleRowObj.getTransform().setLocalPosition(new vec3(0, itemY, 0));

    const switchLabelWidth = innerWidth - SWITCH_WIDTH - 1;
    this.buildRowLabel(
      toggleRowObj,
      "ToggleLabel",
      "Continue last conversation",
      switchLabelWidth,
    );

    const switchObj = global.scene.createSceneObject("VoiceNoteSwitch");
    switchObj.setParent(toggleRowObj);
    const switchX = innerWidth / 2 - SWITCH_WIDTH / 2;
    switchObj.getTransform().setLocalPosition(new vec3(switchX, 0, 0));
    this.toggleSwitch = switchObj.createComponent(
      Switch.getTypeName(),
    ) as Switch;
    this.toggleSwitch.size = new vec3(SWITCH_WIDTH, ROW_HEIGHT - 0.5, 0.5);
    itemY -= ROW_HEIGHT / 2;

    itemY = this.buildDescText(
      "ToggleDesc",
      "When on, voice notes continue your most recent conversation. When off, each voice note starts a new topic.",
      innerWidth,
      itemY,
    );

    itemY -= SECTION_GAP;

    // --- Section: Bluetooth Keyboard ---
    itemY = this.buildSectionHeader(
      "BTKeyboardHeader",
      "Bluetooth Keyboard",
      innerWidth,
      itemY,
    );

    itemY -= ROW_HEIGHT / 2;
    const btStatusRowObj = global.scene.createSceneObject("BTStatusRow");
    this.scrollWindow.addObject(btStatusRowObj);
    btStatusRowObj.getTransform().setLocalPosition(new vec3(0, itemY, 0));

    const btLabelWidth = innerWidth - BTN_WIDTH - 1;
    const btLabelX = -innerWidth / 2 + btLabelWidth / 2;
    this.btStatusLabel = createText({
      parent: btStatusRowObj,
      name: "BTStatusLabel",
      text: "Not connected",
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(btLabelX, 0, 0),
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(
        -btLabelWidth / 2,
        btLabelWidth / 2,
        -ROW_HEIGHT / 2,
        ROW_HEIGHT / 2,
      ),
    });

    const scanBtnObj = global.scene.createSceneObject("ScanBtn");
    scanBtnObj.setParent(btStatusRowObj);
    const scanBtnX = innerWidth / 2 - BTN_WIDTH / 2;
    scanBtnObj.getTransform().setLocalPosition(new vec3(scanBtnX, 0, 0));
    this.scanBtn = scanBtnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    this.scanBtn.size = new vec3(BTN_WIDTH, ROW_HEIGHT - 0.5, 0.5);

    const scanIconSize = (ROW_HEIGHT - 0.5) * 0.45;
    const scanIconX = -BTN_WIDTH / 2 + scanIconSize / 2 + 0.6;
    this.scanBtnIcon = createImage(BLUETOOTH_TEXTURE, {
      parent: scanBtnObj,
      name: "ScanBTIcon",
      position: new vec3(scanIconX, 0, ICON_Z_OFFSET),
      size: scanIconSize,
      shared: false,
    });

    const scanTextOffset = scanIconSize / 2 + 0.2;
    const scanTextWidth = BTN_WIDTH - scanIconSize - 1.2;
    this.scanBtnLabel = createText({
      parent: scanBtnObj,
      name: "ScanBtnLabel",
      text: "Pair",
      size: TextSize.S,
      font: TextFont.SemiBold,
      position: new vec3(scanTextOffset, 0, ICON_Z_OFFSET),
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -scanTextWidth / 2,
        scanTextWidth / 2,
        -ROW_HEIGHT / 2,
        ROW_HEIGHT / 2,
      ),
    });
    itemY -= ROW_HEIGHT / 2;

    itemY = this.buildDescText(
      "BTDesc",
      "Tap Scan to discover nearby Bluetooth keyboards.",
      innerWidth,
      itemY,
    );

    itemY -= SECTION_GAP;

    // --- Section: My Data (last) ---
    itemY = this.buildSectionHeader("DataHeader", "My Data", innerWidth, itemY);

    itemY -= ROW_HEIGHT / 2;
    const deleteRowObj = global.scene.createSceneObject("DeleteRow");
    this.scrollWindow.addObject(deleteRowObj);
    deleteRowObj.getTransform().setLocalPosition(new vec3(0, itemY, 0));

    const deleteLabelWidth = innerWidth - BTN_WIDTH - 1;
    this.buildRowLabel(
      deleteRowObj,
      "DeleteLabel",
      "Delete All Data",
      deleteLabelWidth,
    );

    const deleteBtnWidth = 8;
    const deleteBtnObj = global.scene.createSceneObject("DeleteAllBtn");
    deleteBtnObj.setParent(deleteRowObj);
    const deleteBtnX = innerWidth / 2 - deleteBtnWidth / 2;
    deleteBtnObj.getTransform().setLocalPosition(new vec3(deleteBtnX, 0, 0));
    this.deleteBtn = deleteBtnObj.createComponent(
      RectangleButton.getTypeName(),
    ) as RectangleButton;
    this.deleteBtn.size = new vec3(deleteBtnWidth, ROW_HEIGHT - 0.5, 0.5);

    const deleteIconSize = (ROW_HEIGHT - 0.5) * 0.45;
    const deleteIconX = -deleteBtnWidth / 2 + deleteIconSize / 2 + 0.6;
    createImage(DELETE_TEXTURE, {
      parent: deleteBtnObj,
      name: "DeleteIcon",
      position: new vec3(deleteIconX, 0, ICON_Z_OFFSET),
      size: deleteIconSize,
    });

    const deleteTextOffset = deleteIconSize / 2 + 0.2;
    const deleteTextWidth = deleteBtnWidth - deleteIconSize - 1.2;
    createText({
      parent: deleteBtnObj,
      name: "DeleteBtnLabel",
      text: "Delete",
      size: TextSize.S,
      font: TextFont.SemiBold,
      position: new vec3(deleteTextOffset, 0, ICON_Z_OFFSET),
      horizontalAlignment: HorizontalAlignment.Center,
      worldSpaceRect: Rect.create(
        -deleteTextWidth / 2,
        deleteTextWidth / 2,
        -ROW_HEIGHT / 2,
        ROW_HEIGHT / 2,
      ),
    });
    itemY -= ROW_HEIGHT / 2;

    this.buildDescText(
      "DeleteDesc",
      "Permanently delete all your data including conversations, preferences, and agent connections.",
      innerWidth,
      itemY,
    );
  }

  initializeButtons(): void {
    initializeScrollWindow(this.scrollWindow);
    this.scrollWindow.scrollPositionNormalized = new vec2(0, 1);

    this.addBtn.initialize();
    this.addBtn.onTriggerUp.add(() => {
      const agent = this.agents[0];
      this.onConnectRequested.invoke({
        name: agent.name,
        provider: agent.provider,
        authType: agent.authType,
      });
    });

    this.toggleSwitch.initialize();
    this.toggleSwitch.toggle(true);
    this.toggleSwitch.onValueChange.add((value: number) => {
      this._continueLastTopic = value > 0;
    });

    this.scanBtn.initialize();
    this.scanBtn.onTriggerUp.add(() => {
      if (this._btConnected) {
        this.onBluetoothUnpairRequested.invoke();
      } else {
        this.onBluetoothScanRequested.invoke();
      }
    });

    this.deleteBtn.initialize();
    this.deleteBtn.onTriggerUp.add(() => {
      this.onDeleteAllDataRequested.invoke();
    });
  }

  updateBluetoothStatus(connected: boolean, deviceName: string): void {
    if (!this.btStatusLabel) return;
    this._btConnected = connected;
    this.btStatusLabel.text = connected
      ? `Connected: ${deviceName}`
      : deviceName || "Not connected";
    if (this.scanBtnLabel) {
      this.scanBtnLabel.text = connected ? "Unpair" : "Pair";
    }
    if (this.scanBtnIcon) {
      this.scanBtnIcon.mainMaterial.mainPass.baseTex = connected
        ? BLUETOOTH_OFF_TEXTURE
        : BLUETOOTH_TEXTURE;
    }
  }

  getVoiceNoteContinuesLastTopic(): boolean {
    return this._continueLastTopic;
  }

  setProviderConnected(_provider: string, _connected: boolean): void {
    // No per-row UI to update in the simplified view.
  }

  getTotalHeight(): number {
    return TITLE_HEIGHT + SCROLL_WINDOW_HEIGHT + SECTION_GAP + PADDING.y * 2;
  }

  private buildSectionHeader(
    name: string,
    text: string,
    innerWidth: number,
    y: number,
  ): number {
    y -= SECTION_HEADER_HEIGHT / 2;
    const anchor = global.scene.createSceneObject(name);
    this.scrollWindow.addObject(anchor);
    anchor.getTransform().setLocalPosition(new vec3(0, y, 0));
    createText({
      parent: anchor,
      name: `${name}_Text`,
      text,
      size: TextSize.L,
      font: TextFont.SemiBold,
      color: new vec4(1, 1, 1, 1),
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -SECTION_HEADER_HEIGHT / 2,
        SECTION_HEADER_HEIGHT / 2,
      ),
    });
    return y - SECTION_HEADER_HEIGHT / 2;
  }

  private buildRowLabel(
    parent: SceneObject,
    name: string,
    text: string,
    labelWidth: number,
  ): void {
    const innerWidth = PANEL_WIDTH - PADDING.x * 2;
    const labelX = -innerWidth / 2 + labelWidth / 2;
    createText({
      parent,
      name,
      text,
      size: TextSize.M,
      font: TextFont.Medium,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(labelX, 0, 0),
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(
        -labelWidth / 2,
        labelWidth / 2,
        -ROW_HEIGHT / 2,
        ROW_HEIGHT / 2,
      ),
    });
  }

  private buildDescText(
    name: string,
    text: string,
    innerWidth: number,
    y: number,
  ): number {
    y -= DESC_HEIGHT / 2;
    const anchor = global.scene.createSceneObject(name);
    this.scrollWindow.addObject(anchor);
    anchor.getTransform().setLocalPosition(new vec3(0, y, 0));
    createText({
      parent: anchor,
      name: `${name}_Text`,
      text,
      size: TextSize.S,
      color: new vec4(1, 1, 1, 0.4),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Top,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -DESC_HEIGHT / 2,
        DESC_HEIGHT / 2,
      ),
    });
    return y - DESC_HEIGHT / 2;
  }
}
