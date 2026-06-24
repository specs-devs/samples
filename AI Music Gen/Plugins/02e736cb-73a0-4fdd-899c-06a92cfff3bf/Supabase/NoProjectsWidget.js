import * as Ui from "LensStudio:Ui";

export class NoProjectsWidget {
  constructor(parentWidget) {
    this.widget = new Ui.Widget(parentWidget);
    this.layout = new Ui.BoxLayout();
    this.layout.setDirection(Ui.Direction.TopToBottom);
    this.layout.setContentsMargins(16, 16, 16, 16);

    this.noProjectsLabel = new Ui.Label(this.widget);
    this.noProjectsLabel.text = 'No projects in organization';
    this.noProjectsLabel.foregroundRole = Ui.ColorRole.PlaceholderText;

    this.layout.addWidget(this.noProjectsLabel);
    this.layout.setWidgetAlignment(this.noProjectsLabel, Ui.Alignment.AlignCenter);
    this.widget.layout = this.layout;
  }

  setMessage(organizationName) {
    this.noProjectsLabel.text = `No projects in organization: ${organizationName}`;
  }

  getWidget() {
    return this.widget;
  }

  cleanup() {
    // Nothing specific to cleanup for this simple widget
  }
}
