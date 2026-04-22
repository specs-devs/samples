/**
 * Specs Inc. 2026
 * Simple section controller — parallel arrays of buttons and panels.
 * Pressing a button shows its matching panel and hides all others.
 */
import {BaseButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/BaseButton"
import {bindStartEvent} from "SnapDecorators.lspkg/decorators"

@component
export class SectionController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">SectionController – static section switcher</span><br/><span style="color: #94A3B8; font-size: 11px;">Button at index N shows panel at index N and hides all others. Arrays must match in length.</span>')
  @ui.separator

  @input
  @hint("One content panel per section.")
  sections: SceneObject[]

  @input
  @hint("One button per section. Index must match sections array.")
  buttons: BaseButton[]

  onAwake() {
    for (let i = 0; i < this.sections.length; i++) {
      this.sections[i].enabled = i === 0
    }
  }

  @bindStartEvent
  private onStart() {
    for (let i = 0; i < this.buttons.length; i++) {
      const index = i
      this.buttons[index].onTriggerUp.add(() => this.activate(index))
    }
  }

  activate(index: number) {
    for (let i = 0; i < this.sections.length; i++) {
      this.sections[i].enabled = i === index
    }
  }
}
