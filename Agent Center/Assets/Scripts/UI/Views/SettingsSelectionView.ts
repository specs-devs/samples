import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { ScrollWindow } from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { DEBUG_DISABLE_SCROLL_WINDOWS, ICON_Z_OFFSET, CHEVRON_LEFT_TEXTURE, SCROLLBAR_GAP } from "../Shared/UIConstants";
import { Switch } from "SpectaclesUIKit.lspkg/Scripts/Components/Switch/Switch";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import { TextSize, TextFont } from "../Shared/TextSizes";
import { createImage } from "../Shared/ImageFactory";
import {
  createIconButton,
  createTooltip,
  createText,
  createVerticalScrollBar,
} from "../Shared/UIBuilders";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

const HEADER_HEIGHT = 4;
const OPTION_BTN_HEIGHT = 4;
const OPTION_GAP = 1.2;
const SIDE_PADDING = 2.5;
const BACK_BTN_SIZE = 3.2;
const BACK_BTN_MARGIN = 0.6;
const MAX_SCROLL_HEIGHT = 20;
const HEADER_CONTENT_GAP = 1.5;
const TOGGLE_SECTION_HEADER_HEIGHT = 2;
const TOGGLE_ROW_HEIGHT = 3;
const TOGGLE_GAP = 1.5;
const TOGGLE_SWITCH_WIDTH = 5;
const TOGGLE_DESC_HEIGHT = 2;
const BULK_BTN_HEIGHT = 3;
const BULK_BTN_GAP = 1;
const GRID_BTN_HEIGHT = 5.5;
const GRID_GAP = 1.2;
const DISCLAIMER_GAP = 5.5;
// Fallback disclaimer height used only when no owner component is provided
// (probe measurement can't run). Tune if text looks clipped.
const DISCLAIMER_HEIGHT_FALLBACK = 6;
const DISCLAIMER_TEXT =
  "When enabled, message data is shared via the Remote Service Gateway.\n" +
  "Learn more: developers.snap.com/spectacles/about-spectacles-features/apis/remoteservice-gateway";

export interface ToggleEntry {
  label: string;
  description: string;
  enabled: boolean;
}

export class SettingsSelectionView {
  readonly sceneObject: SceneObject;
  readonly onOptionSelected = new Event<number>();
  readonly onToggleChanged = new Event<{ index: number; enabled: boolean }>();
  readonly onBackRequested = new Event<void>();
  readonly onLayoutReady = new Event<void>();

  private contentContainer: SceneObject;
  private contentObjects: SceneObject[] = [];
  private currentTitle = "";
  private backBtn: RoundButton;
  private backTooltip: Tooltip;
  private initialized = false;
  private panelWidth: number;
  private currentTotalHeight = 0;
  private scrollWindowObj: SceneObject | null = null;
  private scrollWindow: ScrollWindow | null = null;
  private scrollBarObj: SceneObject | null = null;
  private _scrollWindowInitialized = false;
  private toggleSwitches: Switch[] = [];
  private toggleLabelTexts: Text[] = [];
  private bulkToggling = false;
  // Measured at construction time via a root-level probe (see constructor).
  // Falls back to DISCLAIMER_HEIGHT_FALLBACK until the probe resolves.
  private disclaimerHeight = 0;

  constructor(
    parent: SceneObject,
    panelWidth: number,
    owner?: BaseScriptComponent,
  ) {
    this.panelWidth = panelWidth;

    this.sceneObject = global.scene.createSceneObject("SettingsSelectionView");
    this.sceneObject.setParent(parent);
    this.sceneObject.enabled = false;

    const backBtnObj = global.scene.createSceneObject("SelectionBackBtn");
    backBtnObj.setParent(this.sceneObject);
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

    this.backTooltip = createTooltip(backBtnObj, "Back");

    this.contentContainer = global.scene.createSceneObject("SelectionOptions");
    this.contentContainer.setParent(this.sceneObject);

    if (owner) {
      this.measureDisclaimerHeight(panelWidth, owner);
    }
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.backBtn.initialize();
    this.backBtn.onTriggerUp.add(() => this.onBackRequested.invoke());
    this.backBtn.onHoverEnter.add(() => this.backTooltip.setOn(true));
    this.backBtn.onHoverExit.add(() => this.backTooltip.setOn(false));
  }

  showSelection(
    title: string,
    options: string[],
    selectedIndex: number,
    actionIndices: number[] = [],
  ): void {
    this.initialize();
    this.clearContent();
    this.currentTitle = title;

    const innerWidth = this.panelWidth - SIDE_PADDING * 2;
    const contentHeight =
      options.length * OPTION_BTN_HEIGHT + (options.length - 1) * OPTION_GAP;
    this.currentTotalHeight = contentHeight;

    this.layoutHeader(innerWidth);

    const contentCenterY = this.currentTotalHeight / 2 - contentHeight / 2;
    this.contentContainer
      .getTransform()
      .setLocalPosition(new vec3(0, contentCenterY, 0));

    const topY = contentHeight / 2 - OPTION_BTN_HEIGHT / 2;
    const actionSet = new Set(actionIndices);

    for (let i = 0; i < options.length; i++) {
      const isAction = actionSet.has(i);
      const relY = topY - i * (OPTION_BTN_HEIGHT + OPTION_GAP);
      const result = createIconButton({
        parent: this.contentContainer,
        name: `Option_${i}`,
        width: innerWidth,
        height: OPTION_BTN_HEIGHT,
        label: options[i],
        toggleable: !isAction,
        toggled: !isAction && i === selectedIndex,
        position: new vec3(0, relY, 0),
        fontSize: TextSize.M,
      });

      const index = i;
      result.button.onTriggerUp.add(() => {
        this.onOptionSelected.invoke(index);
      });
      this.contentObjects.push(result.sceneObject);
    }
  }

  showGridSelection(
    title: string,
    options: string[],
    selectedIndex: number,
    columns: number = 2,
  ): void {
    this.initialize();
    this.clearContent();
    this.currentTitle = title;

    const innerWidth = this.panelWidth - SIDE_PADDING * 2;
    const rows = Math.ceil(options.length / columns);
    const contentHeight = rows * OPTION_BTN_HEIGHT + (rows - 1) * OPTION_GAP;
    this.currentTotalHeight = contentHeight;

    this.layoutHeader(innerWidth);

    const contentCenterY = this.currentTotalHeight / 2 - contentHeight / 2;
    this.contentContainer
      .getTransform()
      .setLocalPosition(new vec3(0, contentCenterY, 0));

    const colGap = OPTION_GAP;
    const colWidth = (innerWidth - (columns - 1) * colGap) / columns;
    const topY = contentHeight / 2 - OPTION_BTN_HEIGHT / 2;

    for (let i = 0; i < options.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = -innerWidth / 2 + colWidth / 2 + col * (colWidth + colGap);
      const y = topY - row * (OPTION_BTN_HEIGHT + OPTION_GAP);

      const result = createIconButton({
        parent: this.contentContainer,
        name: `Option_${i}`,
        width: colWidth,
        height: OPTION_BTN_HEIGHT,
        label: options[i],
        toggleable: true,
        toggled: i === selectedIndex,
        position: new vec3(x, y, 0),
        fontSize: TextSize.M,
      });

      const index = i;
      result.button.onTriggerUp.add(() => {
        this.onOptionSelected.invoke(index);
      });
      this.contentObjects.push(result.sceneObject);
    }
  }

  showScrollableGridSelection(
    title: string,
    options: string[],
    selectedIndex: number,
    columns: number = 2,
  ): void {
    this.initialize();
    this.clearContent();
    this.currentTitle = title;

    const innerWidth = this.panelWidth - SIDE_PADDING * 2;
    const rows = Math.ceil(options.length / columns);
    const fullContentHeight = rows * GRID_BTN_HEIGHT + (rows - 1) * GRID_GAP;
    const visibleHeight = Math.min(fullContentHeight, MAX_SCROLL_HEIGHT);
    this.currentTotalHeight = visibleHeight;

    this.layoutHeader(innerWidth);

    const scrollAnchorY = this.currentTotalHeight / 2 - visibleHeight / 2;

    if (!this.scrollWindowObj) {
      this.scrollWindowObj = global.scene.createSceneObject("SelectionScrollWindow");
      this.scrollWindowObj.setParent(this.sceneObject);
      this.scrollWindow = this.scrollWindowObj.createComponent(
        ScrollWindow.getTypeName(),
      ) as ScrollWindow;
      if (DEBUG_DISABLE_SCROLL_WINDOWS) this.scrollWindow.enabled = false;
      this.scrollWindow.vertical = true;
      this.scrollWindow.horizontal = false;
    }
    this.scrollWindowObj.getTransform().setLocalPosition(new vec3(0, scrollAnchorY, 0));
    this.scrollWindow!.windowSize = new vec2(innerWidth, visibleHeight);
    this.scrollWindow!.scrollDimensions = new vec2(
      innerWidth,
      Math.max(fullContentHeight, visibleHeight),
    );
    this.scrollWindowObj.enabled = !DEBUG_DISABLE_SCROLL_WINDOWS;

    const colGap = GRID_GAP;
    const colWidth = (innerWidth - (columns - 1) * colGap) / columns;
    const topY = fullContentHeight / 2 - GRID_BTN_HEIGHT / 2;

    for (let i = 0; i < options.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = -innerWidth / 2 + colWidth / 2 + col * (colWidth + colGap);
      const y = topY - row * (GRID_BTN_HEIGHT + GRID_GAP);

      const btnObj = global.scene.createSceneObject(`GridOption_${i}`);
      this.scrollWindow.addObject(btnObj);
      btnObj.getTransform().setLocalPosition(new vec3(x, y, 0));

      const result = createIconButton({
        parent: btnObj,
        name: `GridOptionBtn_${i}`,
        width: colWidth,
        height: GRID_BTN_HEIGHT,
        label: options[i],
        toggleable: true,
        toggled: i === selectedIndex,
        position: vec3.zero(),
        fontSize: TextSize.L,
      });

      const index = i;
      result.button.onTriggerUp.add(() => {
        this.onOptionSelected.invoke(index);
      });
      this.contentObjects.push(btnObj);
    }

    if (!DEBUG_DISABLE_SCROLL_WINDOWS && !this._scrollWindowInitialized) {
      this.scrollWindow!.initialize();
      this._scrollWindowInitialized = true;
    }
    this.scrollWindow!.scrollPositionNormalized = new vec2(0, 1);

    if (!this.scrollBarObj) {
      this.scrollBarObj = createVerticalScrollBar(
        this.sceneObject,
        this.scrollWindow!,
        new vec3(innerWidth / 2 + SCROLLBAR_GAP, scrollAnchorY, 0),
      );
    } else {
      this.scrollBarObj.getTransform().setLocalPosition(
        new vec3(innerWidth / 2 + SCROLLBAR_GAP, scrollAnchorY, 0),
      );
      this.scrollBarObj.enabled = true;
    }
  }

  showScrollableSelection(
    title: string,
    options: string[],
    selectedIndex: number,
  ): void {
    this.initialize();
    this.clearContent();
    this.currentTitle = title;

    const innerWidth = this.panelWidth - SIDE_PADDING * 2;
    const fullContentHeight =
      options.length * OPTION_BTN_HEIGHT + (options.length - 1) * OPTION_GAP;
    const visibleHeight = Math.min(fullContentHeight, MAX_SCROLL_HEIGHT);
    this.currentTotalHeight = visibleHeight;

    this.layoutHeader(innerWidth);

    const scrollAnchorY = this.currentTotalHeight / 2 - visibleHeight / 2;

    if (!this.scrollWindowObj) {
      this.scrollWindowObj = global.scene.createSceneObject("SelectionScrollWindow");
      this.scrollWindowObj.setParent(this.sceneObject);
      this.scrollWindow = this.scrollWindowObj.createComponent(
        ScrollWindow.getTypeName(),
      ) as ScrollWindow;
      if (DEBUG_DISABLE_SCROLL_WINDOWS) this.scrollWindow.enabled = false;
      this.scrollWindow.vertical = true;
      this.scrollWindow.horizontal = false;
    }
    this.scrollWindowObj.getTransform().setLocalPosition(new vec3(0, scrollAnchorY, 0));
    this.scrollWindow!.windowSize = new vec2(innerWidth, visibleHeight);
    this.scrollWindow!.scrollDimensions = new vec2(
      innerWidth,
      Math.max(fullContentHeight, visibleHeight),
    );
    this.scrollWindowObj.enabled = !DEBUG_DISABLE_SCROLL_WINDOWS;

    const topY = fullContentHeight / 2 - OPTION_BTN_HEIGHT / 2;

    for (let i = 0; i < options.length; i++) {
      const relY = topY - i * (OPTION_BTN_HEIGHT + OPTION_GAP);
      const btnObj = global.scene.createSceneObject(`ScrollOption_${i}`);
      this.scrollWindow.addObject(btnObj);
      btnObj.getTransform().setLocalPosition(new vec3(0, relY, 0));

      const result = createIconButton({
        parent: btnObj,
        name: `ScrollOptionBtn_${i}`,
        width: innerWidth,
        height: OPTION_BTN_HEIGHT,
        label: options[i],
        toggleable: true,
        toggled: i === selectedIndex,
        position: vec3.zero(),
        fontSize: TextSize.M,
      });

      const index = i;
      result.button.onTriggerUp.add(() => {
        this.onOptionSelected.invoke(index);
      });
      this.contentObjects.push(btnObj);
    }

    if (!DEBUG_DISABLE_SCROLL_WINDOWS && !this._scrollWindowInitialized) {
      this.scrollWindow!.initialize();
      this._scrollWindowInitialized = true;
    }
    this.scrollWindow!.scrollPositionNormalized = new vec2(0, 1);

    if (!this.scrollBarObj) {
      this.scrollBarObj = createVerticalScrollBar(
        this.sceneObject,
        this.scrollWindow!,
        new vec3(innerWidth / 2 + SCROLLBAR_GAP, scrollAnchorY, 0),
      );
    } else {
      this.scrollBarObj.getTransform().setLocalPosition(
        new vec3(innerWidth / 2 + SCROLLBAR_GAP, scrollAnchorY, 0),
      );
      this.scrollBarObj.enabled = true;
    }
  }

  showToggleList(title: string, entries: ToggleEntry[]): void {
    this.initialize();
    this.clearContent();
    this.currentTitle = title;

    const innerWidth = this.panelWidth - SIDE_PADDING * 2;

    // Use the height measured by the startup probe; fall back to the constant
    // only if the owner wasn't provided and the probe never ran.
    const dh =
      this.disclaimerHeight > 0 ? this.disclaimerHeight : DISCLAIMER_HEIGHT_FALLBACK;

    const disclaimerText = createText({
      parent: this.sceneObject,
      name: "SmartFeaturesDisclaimer",
      text: DISCLAIMER_TEXT,
      size: TextSize.M,
      color: new vec4(1, 1, 1, 0.5),
      position: vec3.zero(),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(
        -innerWidth / 2,
        innerWidth / 2,
        -dh / 2,
        dh / 2,
      ),
    });
    this.contentObjects.push(disclaimerText.getSceneObject());

    const sectionBlock = TOGGLE_ROW_HEIGHT + TOGGLE_DESC_HEIGHT;
    const entriesHeight =
      entries.length * sectionBlock + (entries.length - 1) * TOGGLE_GAP;
    const fullContentHeight = BULK_BTN_HEIGHT + TOGGLE_GAP + entriesHeight;
    const visibleHeight = Math.min(fullContentHeight, MAX_SCROLL_HEIGHT);
    const useScroll = fullContentHeight > MAX_SCROLL_HEIGHT;

    // The back button is always repositioned outside the panel by
    // repositionSettingsTitle(), so no bottom padding is needed — the scroll
    // window sits flush against the view bottom (the outer panel adds its own
    // padding via setInnerSize / setVerticalOffset).
    this.currentTotalHeight = dh + DISCLAIMER_GAP + visibleHeight;
    this.layoutHeader(innerWidth);

    // Anchor the disclaimer to the top of the view, scroll content below it.
    const disclaimerY = this.currentTotalHeight / 2 - dh / 2;
    disclaimerText
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(0, disclaimerY, 0));

    const contentTopY = this.currentTotalHeight / 2 - dh - DISCLAIMER_GAP;
    const scrollAnchorY = contentTopY - visibleHeight / 2;

    if (useScroll) {
      if (!this.scrollWindowObj) {
        this.scrollWindowObj = global.scene.createSceneObject("SelectionScrollWindow");
        this.scrollWindowObj.setParent(this.sceneObject);
        this.scrollWindow = this.scrollWindowObj.createComponent(
          ScrollWindow.getTypeName(),
        ) as ScrollWindow;
        if (DEBUG_DISABLE_SCROLL_WINDOWS) this.scrollWindow.enabled = false;
        this.scrollWindow.vertical = true;
        this.scrollWindow.horizontal = false;
      }
      this.scrollWindowObj.getTransform().setLocalPosition(new vec3(0, scrollAnchorY, 0));
      this.scrollWindow!.windowSize = new vec2(innerWidth, visibleHeight);
      this.scrollWindow!.scrollDimensions = new vec2(innerWidth, fullContentHeight);
      this.scrollWindowObj.enabled = !DEBUG_DISABLE_SCROLL_WINDOWS;
    }

    let cursorY = fullContentHeight / 2;

    cursorY -= BULK_BTN_HEIGHT / 2;
    const bulkRowObj = global.scene.createSceneObject("BulkToggleRow");
    if (useScroll) {
      this.scrollWindow!.addObject(bulkRowObj);
    } else {
      bulkRowObj.setParent(this.contentContainer);
    }
    bulkRowObj.getTransform().setLocalPosition(new vec3(0, cursorY, 0));

    const bulkBtnWidth = (innerWidth - BULK_BTN_GAP) / 2;

    const enableAllBtn = createIconButton({
      parent: bulkRowObj,
      name: "EnableAllBtn",
      width: bulkBtnWidth,
      height: BULK_BTN_HEIGHT,
      label: "Enable All",
      position: new vec3(-innerWidth / 2 + bulkBtnWidth / 2, 0, 0),
      fontSize: TextSize.M,
      fontWeight: TextFont.SemiBold,
    });
    enableAllBtn.button.onTriggerUp.add(() => this.bulkSetAll(true));

    const disableAllBtn = createIconButton({
      parent: bulkRowObj,
      name: "DisableAllBtn",
      width: bulkBtnWidth,
      height: BULK_BTN_HEIGHT,
      label: "Disable All",
      position: new vec3(innerWidth / 2 - bulkBtnWidth / 2, 0, 0),
      fontSize: TextSize.M,
      fontWeight: TextFont.SemiBold,
    });
    disableAllBtn.button.onTriggerUp.add(() => this.bulkSetAll(false));

    this.contentObjects.push(bulkRowObj);
    cursorY -= BULK_BTN_HEIGHT / 2;
    cursorY -= TOGGLE_GAP;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      cursorY -= TOGGLE_ROW_HEIGHT / 2;
      const rowObj = global.scene.createSceneObject(`ToggleRow_${i}`);
      if (useScroll) {
        this.scrollWindow!.addObject(rowObj);
      } else {
        rowObj.setParent(this.contentContainer);
      }
      rowObj.getTransform().setLocalPosition(new vec3(0, cursorY, 0));

      const titleLabelWidth = innerWidth - TOGGLE_SWITCH_WIDTH - 1;
      const labelX = -innerWidth / 2 + titleLabelWidth / 2;
      createText({
        parent: rowObj,
        name: `ToggleTitle_${i}`,
        text: entry.label,
        size: TextSize.L,
        font: TextFont.SemiBold,
        color: new vec4(1, 1, 1, 1),
        position: new vec3(labelX, 0, 0),
        horizontalAlignment: HorizontalAlignment.Left,
        worldSpaceRect: Rect.create(
          -titleLabelWidth / 2,
          titleLabelWidth / 2,
          -TOGGLE_ROW_HEIGHT / 2,
          TOGGLE_ROW_HEIGHT / 2,
        ),
      });

      const switchObj = global.scene.createSceneObject(`ToggleSwitch_${i}`);
      switchObj.setParent(rowObj);
      const switchX = innerWidth / 2 - TOGGLE_SWITCH_WIDTH / 2;
      switchObj.getTransform().setLocalPosition(new vec3(switchX, 0, 0));
      const toggle = switchObj.createComponent(Switch.getTypeName()) as Switch;
      toggle.size = new vec3(TOGGLE_SWITCH_WIDTH, TOGGLE_ROW_HEIGHT - 0.5, 0.5);
      toggle.initialize();
      if (entry.enabled) {
        toggle.toggle(true);
      }
      const idx = i;
      toggle.onValueChange.add((value: number) => {
        if (this.bulkToggling) return;
        const enabled = value > 0;
        this.onToggleChanged.invoke({ index: idx, enabled });
      });
      this.toggleSwitches.push(toggle);
      // We no longer have an Enabled/Disabled text to update.
      // this.toggleLabelTexts.push(labelText);
      this.contentObjects.push(rowObj);
      cursorY -= TOGGLE_ROW_HEIGHT / 2;

      cursorY -= TOGGLE_DESC_HEIGHT / 2;
      const descText = createText({
        parent: useScroll ? this.scrollWindowObj! : this.contentContainer,
        name: `ToggleDesc_${i}`,
        text: entry.description,
        size: TextSize.S,
        color: new vec4(1, 1, 1, 0.4),
        position: new vec3(0, cursorY, 0),
        horizontalOverflow: HorizontalOverflow.Wrap,
        horizontalAlignment: HorizontalAlignment.Left,
        verticalAlignment: VerticalAlignment.Top,
        worldSpaceRect: Rect.create(
          -innerWidth / 2,
          innerWidth / 2,
          -TOGGLE_DESC_HEIGHT / 2,
          TOGGLE_DESC_HEIGHT / 2,
        ),
      });
      this.contentObjects.push(descText.getSceneObject());
      cursorY -= TOGGLE_DESC_HEIGHT / 2;

      if (i < entries.length - 1) {
        cursorY -= TOGGLE_GAP;
      }
    }

    if (useScroll) {
      if (!DEBUG_DISABLE_SCROLL_WINDOWS && !this._scrollWindowInitialized) {
        this.scrollWindow!.initialize();
        this._scrollWindowInitialized = true;
      }
      this.scrollWindow!.scrollPositionNormalized = new vec2(0, 1);

      if (!this.scrollBarObj) {
        this.scrollBarObj = createVerticalScrollBar(
          this.sceneObject,
          this.scrollWindow!,
          new vec3(innerWidth / 2 + SCROLLBAR_GAP, scrollAnchorY, 0),
        );
      } else {
        this.scrollBarObj.getTransform().setLocalPosition(
          new vec3(innerWidth / 2 + SCROLLBAR_GAP, scrollAnchorY, 0),
        );
        this.scrollBarObj.enabled = true;
      }
    }

    this.onLayoutReady.invoke();
  }

  getTotalHeight(): number {
    return this.currentTotalHeight;
  }

  getTitle(): string {
    return this.currentTitle;
  }

  setBackButtonY(y: number): void {
    const backBtnX =
      -this.panelWidth / 2 + BACK_BTN_SIZE / 2 + BACK_BTN_MARGIN + SIDE_PADDING;
    this.backBtn
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(backBtnX, y, 0));
  }

  private bulkSetAll(enabled: boolean): void {
    this.bulkToggling = true;
    for (let i = 0; i < this.toggleSwitches.length; i++) {
      this.toggleSwitches[i].toggle(enabled);
      // We no longer have an Enabled/Disabled text to update.
      // this.toggleLabelTexts[i].text = enabled ? "Enabled" : "Disabled";
      this.onToggleChanged.invoke({ index: i, enabled });
    }
    this.bulkToggling = false;
  }

  // Creates a root-level (always-enabled) scene object containing the disclaimer
  // text and measures its getBoundingBox() on the next frame. Because the probe
  // has no disabled parent, rendering happens immediately — by the time the user
  // can tap Smart Features (multiple frames away), this.disclaimerHeight is set.
  private measureDisclaimerHeight(
    panelWidth: number,
    owner: BaseScriptComponent,
  ): void {
    const innerWidth = panelWidth - SIDE_PADDING * 2;
    const probe = global.scene.createSceneObject("DisclaimerProbe");
    // Position far off-screen so it's never visible while it renders.
    probe.getTransform().setLocalPosition(new vec3(0, -1000, 0));

    const probeText = createText({
      parent: probe,
      name: "DisclaimerProbeText",
      text: DISCLAIMER_TEXT,
      size: TextSize.M,
      position: vec3.zero(),
      horizontalOverflow: HorizontalOverflow.Wrap,
      horizontalAlignment: HorizontalAlignment.Left,
      worldSpaceRect: Rect.create(-innerWidth / 2, innerWidth / 2, -50, 50),
    });

    const measureEvent = owner.createEvent("UpdateEvent");
    measureEvent.bind(() => {
      const height = probeText.getBoundingBox().getSize().y;
      if (height === 0) return; // not ready yet — retry next frame
      this.disclaimerHeight = height;
      measureEvent.enabled = false;
      probe.destroy();
    });
  }

  private layoutHeader(_innerWidth: number): void {
    const headerY = -this.currentTotalHeight / 2 + HEADER_HEIGHT / 2;
    const backBtnX =
      -this.panelWidth / 2 + BACK_BTN_SIZE / 2 + BACK_BTN_MARGIN + SIDE_PADDING;

    this.backBtn
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(backBtnX, headerY, 0));
  }

  private clearContent(): void {
    for (const obj of this.contentObjects) {
      obj.destroy();
    }
    this.contentObjects = [];
    this.toggleSwitches = [];
    this.toggleLabelTexts = [];

    if (this.scrollBarObj) {
      this.scrollBarObj.enabled = false;
    }
    if (this.scrollWindowObj) {
      this.scrollWindowObj.enabled = false;
    }
  }
}
