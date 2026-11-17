import { BackPlate } from "UIKit.lspkg/Scripts/BackPlate";
import { ScrollWindow } from "UIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { Button } from "UIKit.lspkg/Scripts/Components/Button/Button";
import { createSystemButton } from "../Shared/SystemButton";
import { createText, createVerticalScrollBar, initializeScrollWindow } from "../Shared/UIBuilders";
import { createImage } from "../Shared/ImageFactory";
import { ICON_Z_OFFSET, PANEL_WIDTH, TITLE_HEIGHT, Z_CONTENT, SCROLLBAR_GAP } from "../Shared/UIConstants";
import Event from "InteractionKit.lspkg/Utils/Event";
import { AuthType } from "../../Types";
import { TextStyle, TextColor } from "../Shared/UIStyle";

const ADD_TEXTURE: Texture = requireAsset(
  "../../../Visuals/Textures/link.png",
) as Texture;

const DELETE_TEXTURE: Texture = requireAsset(
  "Icons.lspkg/Iconography/System/trash.png",
) as Texture;

const ROW_HEIGHT = 3;
const SECTION_GAP = 1;
const PADDING = new vec2(3, 1.5);
// The window hugs its content up to this cap, then scrolls.
const MAX_WINDOW_HEIGHT = 26;

// Section layout (no backings): a block with a bold
// title and its action button on one row and a muted description below.
const CARD_PAD = 0;
const CARD_TITLE_ROW_HEIGHT = 2.8;
const CARD_DESC_HEIGHT = 3.8;
const CARD_ROW_GAP = 0.2;
const CARD_HEIGHT =
  CARD_PAD * 2 + CARD_TITLE_ROW_HEIGHT + CARD_ROW_GAP + CARD_DESC_HEIGHT;
// Compact action button: width hugs [icon + label] with side padding.
const ACTION_BTN_HEIGHT = 2.4;
const ACTION_BTN_ICON = ACTION_BTN_HEIGHT * 0.45;
const ACTION_BTN_PAD_X = 1;
const ACTION_BTN_ICON_GAP = 0.4;
const ACTION_BTN_CHAR_WIDTH = 0.55; // estimated width per label char (size S)
const ACTION_BTN_MIN_WIDTH = 5.5;
const DANGER_COLOR = new vec4(1, 0.5, 0.5, 1);
const SECTION_SPACING = 2;

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

  private addBtn: Button;
  private deleteBtn: Button;
  private scrollWindow: ScrollWindow;
  private totalHeight = 0;
  private agents: AgentEntry[];

  constructor(parent: SceneObject, agents: AgentEntry[]) {
    this.agents = agents;
    const innerWidth = PANEL_WIDTH - PADDING.x * 2;
    const sectionBlock = CARD_HEIGHT;
    const sectionCount = 2;
    const scrollContentHeight =
      sectionBlock * sectionCount + SECTION_SPACING * (sectionCount - 1);
    const windowHeight = Math.min(scrollContentHeight, MAX_WINDOW_HEIGHT);
    const totalHeight =
      TITLE_HEIGHT + windowHeight + SECTION_GAP + PADDING.y * 2;
    this.totalHeight = totalHeight;

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
      style: TextStyle.PanelTitle,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(0, cursorY, Z_CONTENT),
      horizontalAlignment: HorizontalAlignment.Left,
      layoutRect: Rect.create(
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
        new vec3(0, cursorY - windowHeight / 2, Z_CONTENT),
      );

    const scrollObj = global.scene.createSceneObject("SettingsScroll");
    scrollObj.setParent(scrollAnchor);
    scrollObj.getTransform().setLocalPosition(vec3.zero());

    this.scrollWindow = scrollObj.createComponent(
      ScrollWindow.getTypeName(),
    ) as ScrollWindow;
    this.scrollWindow.vertical = true;
    this.scrollWindow.horizontal = false;
    this.scrollWindow.windowSize = new vec2(innerWidth, windowHeight);
    this.scrollWindow.scrollDimensions = new vec2(
      innerWidth,
      Math.max(scrollContentHeight, windowHeight),
    );

    createVerticalScrollBar(
      scrollAnchor,
      this.scrollWindow,
      new vec3(innerWidth / 2 + SCROLLBAR_GAP, 0, 0),
    );

    // UIKit "Center" content origin is relative to the initial viewport, so the
    // content top sits at the window top (not half the scroll span).
    let itemY = windowHeight / 2;

    // --- Section: Connect ---
    const connect = this.buildActionCard({
      name: "Connect",
      y: itemY,
      innerWidth,
      title: "Local Agent",
      description:
        "Run the spectacles-agent-bridge on your computer, then tap to enter your pairing code.",
      buttonLabel: "Connect",
      buttonIcon: ADD_TEXTURE,
      buttonStyle: "Primary",
      danger: false,
    });
    this.addBtn = connect.button;
    itemY = connect.bottomY - SECTION_SPACING;

    // --- Section: My Data (last, destructive) ---
    const del = this.buildActionCard({
      name: "Delete",
      y: itemY,
      innerWidth,
      title: "Delete All Data",
      description:
        "Permanently delete all your data including conversations, preferences, and agent connections.",
      buttonLabel: "Delete",
      buttonIcon: DELETE_TEXTURE,
      buttonStyle: "Secondary",
      danger: true,
    });
    this.deleteBtn = del.button;
  }

  initializeButtons(): void {
    initializeScrollWindow(this.scrollWindow);
    // UIKit normalized scroll: y 0 = top.
    this.scrollWindow.scrollPositionNormalized = new vec2(0, 0);

    this.addBtn.initialize();
    this.addBtn.onTriggerUp.add(() => {
      const agent = this.agents[0];
      this.onConnectRequested.invoke({
        name: agent.name,
        provider: agent.provider,
        authType: agent.authType,
      });
    });

    this.deleteBtn.initialize();
    this.deleteBtn.onTriggerUp.add(() => {
      this.onDeleteAllDataRequested.invoke();
    });
  }

  setProviderConnected(_provider: string, _connected: boolean): void {
    // No per-row UI to update in the simplified view.
  }

  getTotalHeight(): number {
    return this.totalHeight;
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
      style: TextStyle.Label,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(labelX, 0, 0),
      horizontalAlignment: HorizontalAlignment.Left,
      layoutRect: Rect.create(
        -labelWidth / 2,
        labelWidth / 2,
        -ROW_HEIGHT / 2,
        ROW_HEIGHT / 2,
      ),
    });
  }

  /**
   * A block with a bold title and one action button on the first row and a
   * muted description below. `danger` tints the button red.
   */
  private buildActionCard(opts: {
    name: string;
    y: number;
    innerWidth: number;
    title: string;
    description: string;
    buttonLabel: string;
    buttonIcon: Texture;
    buttonStyle: "Primary" | "Secondary" | "Ghost";
    danger: boolean;
  }): { button: Button; bottomY: number } {
    const { innerWidth } = opts;
    const centerY = opts.y - CARD_HEIGHT / 2;
    const contentWidth = innerWidth - CARD_PAD * 2;

    const cardObj = global.scene.createSceneObject(`${opts.name}Card`);
    this.scrollWindow.addObject(cardObj);
    cardObj.getTransform().setLocalPosition(new vec3(0, centerY, 0));

    const topRowY = CARD_HEIGHT / 2 - CARD_PAD - CARD_TITLE_ROW_HEIGHT / 2;
    const descY = -CARD_HEIGHT / 2 + CARD_PAD + CARD_DESC_HEIGHT / 2;
    const left = -contentWidth / 2;

    const labelWidth = opts.buttonLabel.length * ACTION_BTN_CHAR_WIDTH;
    const groupWidth = ACTION_BTN_ICON + ACTION_BTN_ICON_GAP + labelWidth;
    const btnWidth = Math.max(
      ACTION_BTN_MIN_WIDTH,
      groupWidth + ACTION_BTN_PAD_X * 2,
    );

    // Title
    const titleWidth = contentWidth - btnWidth - 1;
    createText({
      parent: cardObj,
      name: `${opts.name}Title`,
      text: opts.title,
      style: TextStyle.ItemTitle,
      color: new vec4(1, 1, 1, 1),
      position: new vec3(0, topRowY, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Left,
      layoutRect: Rect.create(
        left,
        left + titleWidth,
        -CARD_TITLE_ROW_HEIGHT / 2,
        CARD_TITLE_ROW_HEIGHT / 2,
      ),
    });

    // Description
    createText({
      parent: cardObj,
      name: `${opts.name}Desc`,
      text: opts.description,
      style: TextStyle.Body,
      color: TextColor.Muted,
      position: new vec3(0, descY, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      verticalAlignment: VerticalAlignment.Top,
      layoutRect: Rect.create(
        left,
        contentWidth / 2,
        -CARD_DESC_HEIGHT / 2,
        CARD_DESC_HEIGHT / 2,
      ),
    });

    // Action button (right end of the title row, vertically centered on it)
    const btnObj = global.scene.createSceneObject(`${opts.name}Btn`);
    btnObj.setParent(cardObj);
    btnObj
      .getTransform()
      .setLocalPosition(new vec3(contentWidth / 2 - btnWidth / 2, topRowY, 0));
    const btn = createSystemButton(btnObj, opts.buttonStyle);
    btn.size = new vec3(btnWidth, ACTION_BTN_HEIGHT, 0.5);

    // Icon + label read as one centered group.
    const iconX = -groupWidth / 2 + ACTION_BTN_ICON / 2;
    const icon = createImage(opts.buttonIcon, {
      parent: btnObj,
      name: `${opts.name}BtnIcon`,
      position: new vec3(iconX, 0, ICON_Z_OFFSET),
      size: ACTION_BTN_ICON,
      shared: !opts.danger,
    });
    const labelX = groupWidth / 2 - labelWidth / 2;
    createText({
      parent: btnObj,
      name: `${opts.name}BtnLabel`,
      text: opts.buttonLabel,
      style: TextStyle.ButtonCompact,
      color: opts.danger ? DANGER_COLOR : new vec4(1, 1, 1, 1),
      position: new vec3(labelX, 0, ICON_Z_OFFSET),
      horizontalOverflow: HorizontalOverflow.Truncate,
      horizontalAlignment: HorizontalAlignment.Center,
      layoutRect: Rect.create(
        -labelWidth / 2,
        labelWidth / 2,
        -ACTION_BTN_HEIGHT / 2,
        ACTION_BTN_HEIGHT / 2,
      ),
    });
    if (opts.danger) {
      icon.mainPass.baseColor = DANGER_COLOR;
    }

    return { button: btn, bottomY: opts.y - CARD_HEIGHT };
  }
}
