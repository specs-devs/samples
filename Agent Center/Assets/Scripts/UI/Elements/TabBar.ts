import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { RoundButton } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton";
import { Tooltip } from "SpectaclesUIKit.lspkg/Scripts/Tooltip";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { createImage } from "../Shared/ImageFactory";
import {
  ICON_Z_OFFSET,
  BOT_GROUP_TEXTURE,
  SETTINGS_TEXTURE,
  Z_CONTENT,
} from "../Shared/UIConstants";
import { createTooltip } from "../Shared/UIBuilders";

export const TAB_BAR_WIDTH = 5;
const TAB_BTN_SIZE = 2.8;
const TAB_GAP = 1.5;
const TAB_BAR_PADDING_Y = 1;

export class TabBar {
  private tabBarObj: SceneObject;
  private agentsTabBtn: RoundButton;
  private settingsTabBtn: RoundButton;
  private agentsTooltip: Tooltip;
  private settingsTooltip: Tooltip;
  private _activeTab: "agents" | "settings" = "agents";

  public readonly onAgentsSelected = new Event<void>();
  public readonly onSettingsSelected = new Event<void>();

  constructor(parent: SceneObject) {
    this.build(parent);
  }

  private build(parent: SceneObject): void {
    const tabBarHeight = TAB_BAR_PADDING_Y * 2 + TAB_BTN_SIZE * 2 + TAB_GAP;
    const tabBarCenterY = tabBarHeight / 2;

    this.tabBarObj = global.scene.createSceneObject("TabBar");
    this.tabBarObj.setParent(parent);
    this.tabBarObj
      .getTransform()
      .setLocalPosition(new vec3(0, tabBarCenterY, 0));

    const plateObj = global.scene.createSceneObject("TabBarPlate");
    plateObj.setParent(this.tabBarObj);
    const plate = plateObj.createComponent(
      BackPlate.getTypeName(),
    ) as BackPlate;
    plate.style = "dark";
    plate.size = new vec2(TAB_BAR_WIDTH, tabBarHeight);

    const topBtnY = tabBarHeight / 2 - TAB_BAR_PADDING_Y - TAB_BTN_SIZE / 2;
    const bottomBtnY = topBtnY - TAB_BTN_SIZE - TAB_GAP;

    const agentsBtnObj = global.scene.createSceneObject("AgentsTabBtn");
    agentsBtnObj.setParent(this.tabBarObj);
    agentsBtnObj
      .getTransform()
      .setLocalPosition(new vec3(0, topBtnY, Z_CONTENT));
    this.agentsTabBtn = agentsBtnObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    this.agentsTabBtn.width = TAB_BTN_SIZE;

    const botIconSize = TAB_BTN_SIZE * 0.45;
    createImage(BOT_GROUP_TEXTURE, {
      parent: agentsBtnObj,
      name: "AgentsTabIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: botIconSize * 1.25,
    });

    const settingsBtnObj = global.scene.createSceneObject("SettingsTabBtn");
    settingsBtnObj.setParent(this.tabBarObj);
    settingsBtnObj
      .getTransform()
      .setLocalPosition(new vec3(0, bottomBtnY, Z_CONTENT));
    this.settingsTabBtn = settingsBtnObj.createComponent(
      RoundButton.getTypeName(),
    ) as RoundButton;
    this.settingsTabBtn.width = TAB_BTN_SIZE;

    const settingsIconSize = TAB_BTN_SIZE * 0.45;
    createImage(SETTINGS_TEXTURE, {
      parent: settingsBtnObj,
      name: "SettingsTabIcon",
      position: new vec3(0, 0, ICON_Z_OFFSET),
      size: settingsIconSize,
    });

    this.agentsTooltip = createTooltip(agentsBtnObj, "Agents");
    this.settingsTooltip = createTooltip(settingsBtnObj, "Settings");
  }

  initialize(): void {
    this.agentsTabBtn.setIsToggleable(true);
    this.settingsTabBtn.setIsToggleable(true);
    this.agentsTabBtn.initialize();
    this.settingsTabBtn.initialize();

    this.agentsTabBtn.toggle(true);

    this.agentsTabBtn.onTriggerUp.add(() => {
      if (this._activeTab === "agents") {
        this.agentsTabBtn.toggle(true);
        return;
      }
      this._activeTab = "agents";
      this.agentsTabBtn.toggle(true);
      this.settingsTabBtn.toggle(false);
      this.onAgentsSelected.invoke();
    });

    this.settingsTabBtn.onTriggerUp.add(() => {
      if (this._activeTab === "settings") {
        this.settingsTabBtn.toggle(true);
        return;
      }
      this._activeTab = "settings";
      this.settingsTabBtn.toggle(true);
      this.agentsTabBtn.toggle(false);
      this.onSettingsSelected.invoke();
    });

    this.agentsTabBtn.onHoverEnter.add(() => this.agentsTooltip.setOn(true));
    this.agentsTabBtn.onHoverExit.add(() => this.agentsTooltip.setOn(false));
    this.settingsTabBtn.onHoverEnter.add(() =>
      this.settingsTooltip.setOn(true),
    );
    this.settingsTabBtn.onHoverExit.add(() =>
      this.settingsTooltip.setOn(false),
    );
  }

  selectAgents(): void {
    this._activeTab = "agents";
    this.agentsTabBtn.toggle(true);
    this.settingsTabBtn.toggle(false);
  }

  selectSettings(): void {
    this._activeTab = "settings";
    this.settingsTabBtn.toggle(true);
    this.agentsTabBtn.toggle(false);
  }

  getActiveTab(): "agents" | "settings" {
    return this._activeTab;
  }

  getSceneObject(): SceneObject {
    return this.tabBarObj;
  }
}
