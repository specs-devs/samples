import { ScrollWindow } from "SpectaclesUIKit.lspkg/Scripts/Components/ScrollWindow/ScrollWindow";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatMessage } from "../../Types";
import { createVerticalScrollBar, initializeScrollWindow } from "../Shared/UIBuilders";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";
import animate, {
  CancelSet,
} from "SpectaclesInteractionKit.lspkg/Utils/animate";
import { setTimeout } from "SpectaclesInteractionKit.lspkg/Utils/FunctionTimingUtils";
import { SCROLLBAR_GAP } from "../Shared/UIConstants";

const BUBBLE_PADDING = 0.5;
const MAX_POOL_SIZE = 24;
const MIN_WINDOW_HEIGHT = 4;
const BUBBLE_WIDTH_RATIO = 0.75;
const SIDE_MARGIN = 1;
const STAGGER_DELAY_MS = 80;
const INITIAL_DELAY_MS = 150;
const BUBBLE_ANIM_DURATION = 0.35;
const SLIDE_OFFSET_X = 3;
const SLIDE_OFFSET_Y = -1.5;
const START_SCALE = 0.85;

@component
export class ChatMessageList extends BaseScriptComponent {
  public readonly onImageTapped = new Event<{
    texture: Texture;
    sourceObj: SceneObject;
    srcWidth: number;
    srcHeight: number;
  }>();

  private scrollWindow: ScrollWindow;
  private scrollObj: SceneObject;
  private scrollRoot: SceneObject;
  private bubbleContainer: SceneObject;
  private windowWidth = 25;
  private windowHeight = 18;
  private effectiveHeight = MIN_WINDOW_HEIGHT;

  private scrollBarObj: SceneObject;
  private scrollBarSetHovered: ((hovered: boolean) => void) | null = null;
  private bubblePool: ChatMessageBubble[] = [];
  private activeBubbles: ChatMessageBubble[] = [];
  private loadedMessageIds: string[] = [];
  private cachedTotalHeight = 0;
  private animGeneration = 0;
  private readonly _scratchAnimPos = new vec3(0, 0, 0);
  private readonly _scratchAnimScale = new vec3(1, 1, 1);

  onAwake(): void {
    const root = this.getSceneObject();

    this.scrollObj = global.scene.createSceneObject("ChatScrollWindow");
    this.scrollObj.setParent(root);
    this.scrollObj.getTransform().setLocalPosition(vec3.zero());

    this.scrollWindow = this.scrollObj.createComponent(
      ScrollWindow.getTypeName(),
    ) as ScrollWindow;
    this.scrollRoot = global.scene.createSceneObject("ChatScrollRoot");
    this.scrollRoot.setParent(this.scrollObj);
    this.scrollRoot.getTransform().setLocalPosition(new vec3(0, 0, 0.1));

    // Intermediate parent for bubbles. Its Y position absorbs the coordinate
    // conversion (scrollHeight/2) so individual bubble local positions are
    // stable "offset from top" values that never need to be updated.
    this.bubbleContainer = global.scene.createSceneObject("BubbleContainer");
    this.bubbleContainer.setParent(this.scrollRoot);
    this.bubbleContainer.getTransform().setLocalPosition(vec3.zero());

    this.scrollWindow.vertical = true;
    this.scrollWindow.horizontal = false;
    this.scrollWindow.windowSize = new vec2(
      this.windowWidth,
      this.windowHeight,
    );
    this.scrollWindow.scrollDimensions = new vec2(
      this.windowWidth,
      this.windowHeight,
    );
    initializeScrollWindow(this.scrollWindow);
    this.scrollObj.enabled = false; // disabled until content exists

    this.scrollBarObj = createVerticalScrollBar(
      root,
      this.scrollWindow,
      new vec3(this.windowWidth / 2 + SCROLLBAR_GAP, 0, 0),
      undefined,
      (setHovered) => { this.scrollBarSetHovered = setHovered; },
    );
  }

  setScrollEnabled(enabled: boolean): void {
    if (isNull(this.scrollObj)) return;
    this.scrollObj.enabled = enabled;
  }

  setBottomOffset(offset: number): void {
    const t = this.getSceneObject().getTransform();
    const pos = t.getLocalPosition();
    t.setLocalPosition(new vec3(pos.x, offset, pos.z));
  }

  getBottomOffset(): number {
    return this.getSceneObject().getTransform().getLocalPosition().y;
  }

  configure(width: number, height: number): void {
    this.windowWidth = width;
    this.windowHeight = height;
    this.effectiveHeight = MIN_WINDOW_HEIGHT;
    this.scrollWindow.windowSize = new vec2(width, MIN_WINDOW_HEIGHT);
    this.scrollWindow.scrollDimensions = new vec2(width, MIN_WINDOW_HEIGHT);
    this.scrollBarObj
      .getTransform()
      .setLocalPosition(new vec3(width / 2 + SCROLLBAR_GAP, 0, 0));
  }

  getEffectiveHeight(): number {
    return this.effectiveHeight;
  }

  getMessageCount(): number {
    return this.activeBubbles.length;
  }

  setScrollBarHovered(hovered: boolean): void {
    this.scrollBarSetHovered?.(hovered);
  }

  loadThread(agentName: string, messages: ChatMessage[]): boolean {
    const nextMessageIds = messages.map((msg) => msg.id);
    const threadChanged = !this.idsMatch(nextMessageIds, this.loadedMessageIds);
    const bubbleWidth = (this.windowWidth - 2) * BUBBLE_WIDTH_RATIO;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const senderName = this.getSenderName(msg, agentName);
      const bubble =
        i < this.activeBubbles.length
          ? this.activeBubbles[i]
          : this.getBubbleFromPool();
      if (i >= this.activeBubbles.length) {
        this.activeBubbles.push(bubble);
      }
      bubble.configure(bubbleWidth);
      bubble.setMessage(msg.content, senderName, msg.sender, msg.images);
    }

    while (this.activeBubbles.length > messages.length) {
      this.returnBubbleToPool(this.activeBubbles.pop() as ChatMessageBubble);
    }

    this.rebuildLayout();
    if (threadChanged) {
      this.scrollToBottom();
      for (const bubble of this.activeBubbles) {
        bubble.setOpacity(0);
      }
    } else {
      for (const bubble of this.activeBubbles) {
        bubble.setOpacity(1);
        bubble.getSceneObject().getTransform().setLocalScale(vec3.one());
      }
    }
    this.loadedMessageIds = nextMessageIds;
    return threadChanged;
  }

  addMessage(msg: ChatMessage, agentName: string): void {
    const senderName =
      msg.sender === "agent"
        ? agentName
        : msg.sender === "system"
          ? "System"
          : "You";
    this.appendBubble(msg.content, senderName, msg.sender, msg.images);
    this.loadedMessageIds.push(msg.id);
    this.appendIncrementalLayout();
    this.scrollToBottom();
  }

  clear(): void {
    for (const bubble of this.activeBubbles) {
      this.returnBubbleToPool(bubble);
    }
    this.activeBubbles = [];
    this.loadedMessageIds = [];
    this.cachedTotalHeight = 0;
  }

  private appendBubble(
    content: string,
    senderName: string,
    sender: "user" | "agent" | "system",
    images?: Texture[],
  ): void {
    const bubble = this.getBubbleFromPool();
    const bubbleWidth = (this.windowWidth - 2) * BUBBLE_WIDTH_RATIO;
    bubble.configure(bubbleWidth);
    bubble.setMessage(content, senderName, sender, images);
    bubble.setOpacity(1);
    bubble.getSceneObject().getTransform().setLocalScale(vec3.one());
    this.activeBubbles.push(bubble);
  }

  private getSenderName(msg: ChatMessage, agentName: string): string {
    return msg.sender === "agent"
      ? agentName
      : msg.sender === "system"
        ? "System"
        : "You";
  }

  private idsMatch(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private getBubbleFromPool(): ChatMessageBubble {
    if (this.bubblePool.length > 0) {
      const bubble = this.bubblePool.pop() as ChatMessageBubble;
      bubble.getSceneObject().enabled = true;
      return bubble;
    }
    const obj = global.scene.createSceneObject("ChatBubble");
    obj.setParent(this.bubbleContainer);
    const bubble = obj.createComponent(
      ChatMessageBubble.getTypeName(),
    ) as ChatMessageBubble;
    bubble.onImageTapped.add((payload) => {
      this.onImageTapped.invoke(payload);
    });
    return bubble;
  }

  private returnBubbleToPool(bubble: ChatMessageBubble): void {
    bubble.getSceneObject().enabled = false;
    if (this.bubblePool.length < MAX_POOL_SIZE) {
      this.bubblePool.push(bubble);
    } else {
      bubble.getSceneObject().destroy();
    }
  }

  private appendIncrementalLayout(): void {
    const bubble = this.activeBubbles[this.activeBubbles.length - 1];
    const h = bubble.getHeight();
    const isFirst = this.activeBubbles.length === 1;

    // Compute stable offset-from-top for this bubble before updating the total.
    // This value is set once on the bubble's local transform and never changes,
    // regardless of how many messages are added later.
    const offsetFromTop = this.cachedTotalHeight + (isFirst ? 0 : BUBBLE_PADDING) + h / 2;

    if (!isFirst) {
      this.cachedTotalHeight += BUBBLE_PADDING;
    }
    this.cachedTotalHeight += h;

    this.effectiveHeight = Math.max(
      MIN_WINDOW_HEIGHT,
      Math.min(this.cachedTotalHeight, this.windowHeight),
    );
    this.scrollWindow.windowSize = new vec2(
      this.windowWidth,
      this.effectiveHeight,
    );

    const scrollHeight = Math.max(this.cachedTotalHeight, this.effectiveHeight);
    this.scrollWindow.scrollDimensions = new vec2(
      this.windowWidth,
      scrollHeight,
    );

    const bubbleWidth = (this.windowWidth - 2) * BUBBLE_WIDTH_RATIO;
    const maxOffset = (this.windowWidth - 2 - bubbleWidth) / 2 - SIDE_MARGIN;

    const x = bubble.getIsSystem()
      ? 0
      : bubble.getIsAgent()
        ? -maxOffset
        : maxOffset;
    bubble
      .getSceneObject()
      .getTransform()
      .setLocalPosition(new vec3(x, -offsetFromTop, 0));

    // Single O(1) update: move the container anchor to match the new scroll
    // content size. Existing bubble local positions are untouched.
    this.bubbleContainer
      .getTransform()
      .setLocalPosition(new vec3(0, scrollHeight / 2, 0.1));

    if (this.cachedTotalHeight < this.effectiveHeight) {
      const offset = -(this.effectiveHeight - this.cachedTotalHeight) / 2;
      this.scrollRoot.getTransform().setLocalPosition(new vec3(0, offset, 0.1));
    } else {
      this.scrollRoot.getTransform().setLocalPosition(new vec3(0, 0, 0.1));
    }
  }

  private rebuildLayout(): void {
    let totalHeight = 0;
    for (let i = 0; i < this.activeBubbles.length; i++) {
      if (i > 0) totalHeight += BUBBLE_PADDING;
      totalHeight += this.activeBubbles[i].getHeight();
    }
    this.cachedTotalHeight = totalHeight;

    this.effectiveHeight = Math.max(
      MIN_WINDOW_HEIGHT,
      Math.min(totalHeight, this.windowHeight),
    );
    this.scrollWindow.windowSize = new vec2(
      this.windowWidth,
      this.effectiveHeight,
    );

    const scrollHeight = Math.max(totalHeight, this.effectiveHeight);
    this.scrollWindow.scrollDimensions = new vec2(
      this.windowWidth,
      scrollHeight,
    );

    const bubbleWidth = (this.windowWidth - 2) * BUBBLE_WIDTH_RATIO;
    const maxOffset = (this.windowWidth - 2 - bubbleWidth) / 2 - SIDE_MARGIN;

    // Position each bubble as −offsetFromTop in bubbleContainer space.
    // bubbleContainer.y = scrollHeight/2 converts this to the correct absolute Y.
    let currentOffset = 0;
    for (let i = 0; i < this.activeBubbles.length; i++) {
      const bubble = this.activeBubbles[i];
      const h = bubble.getHeight();
      if (i > 0) currentOffset += BUBBLE_PADDING;
      const offsetFromTop = currentOffset + h / 2;
      const x = bubble.getIsSystem()
        ? 0
        : bubble.getIsAgent()
          ? -maxOffset
          : maxOffset;
      bubble
        .getSceneObject()
        .getTransform()
        .setLocalPosition(new vec3(x, -offsetFromTop, 0));
      currentOffset += h;
    }

    this.bubbleContainer
      .getTransform()
      .setLocalPosition(new vec3(0, scrollHeight / 2, 0.1));

    if (totalHeight < this.effectiveHeight) {
      const offset = -(this.effectiveHeight - totalHeight) / 2;
      this.scrollRoot.getTransform().setLocalPosition(new vec3(0, offset, 0.1));
    } else {
      this.scrollRoot.getTransform().setLocalPosition(new vec3(0, 0, 0.1));
    }
  }

  private scrollToBottom(): void {
    this.scrollWindow.setVelocity(vec2.zero());
    if (this.cachedTotalHeight <= this.effectiveHeight) return;
    this.scrollWindow.scrollPositionNormalized = new vec2(0, -1);
  }

  animateMessagesIn(cancelSet: CancelSet): void {
    const count = this.activeBubbles.length;
    if (count === 0) return;

    const gen = ++this.animGeneration;

    // Zero all bubbles up-front so we never depend on loadThread's opacity state.
    for (let i = 0; i < count; i++) {
      this.activeBubbles[i].setOpacity(0);
    }

    const scrollHeight = Math.max(this.cachedTotalHeight, this.effectiveHeight);
    const visibleTopY = this.effectiveHeight - scrollHeight / 2;
    const visibleBottomY = -scrollHeight / 2;

    // Bubble local positions are in bubbleContainer space (−offsetFromTop).
    // Add the container's Y to get scroll-root-space Y for the visibility check.
    const containerY = this.bubbleContainer.getTransform().getLocalPosition().y;

    const isVisible: boolean[] = new Array(count).fill(false);
    const visibleIndices: number[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const bubble = this.activeBubbles[i];
      const bubbleY =
        containerY + bubble.getSceneObject().getTransform().getLocalPosition().y;
      const h = bubble.getHeight();
      if (bubbleY + h / 2 >= visibleBottomY && bubbleY - h / 2 <= visibleTopY) {
        visibleIndices.push(i);
        isVisible[i] = true;
      }
    }

    for (let i = 0; i < count; i++) {
      if (!isVisible[i]) {
        this.activeBubbles[i].setOpacity(1);
        this.activeBubbles[i]
          .getSceneObject()
          .getTransform()
          .setLocalScale(vec3.one());
      }
    }

    const finalPositions: vec3[] = [];
    for (const idx of visibleIndices) {
      const bubble = this.activeBubbles[idx];
      const transform = bubble.getSceneObject().getTransform();
      const pos = transform.getLocalPosition();
      finalPositions.push(pos);

      const slideX = bubble.getIsSystem()
        ? 0
        : SLIDE_OFFSET_X * (bubble.getIsAgent() ? -1 : 1);
      transform.setLocalPosition(
        new vec3(pos.x + slideX, pos.y + SLIDE_OFFSET_Y, pos.z),
      );
      transform.setLocalScale(new vec3(START_SCALE, START_SCALE, START_SCALE));
    }

    for (let i = 0; i < visibleIndices.length; i++) {
      const delay = INITIAL_DELAY_MS + i * STAGGER_DELAY_MS;
      const bubbleIndex = visibleIndices[i];
      const finalPos = finalPositions[i];

      setTimeout(() => {
        if (gen !== this.animGeneration) return;
        const bubble = this.activeBubbles[bubbleIndex];
        if (!bubble) return;

        const transform = bubble.getSceneObject().getTransform();
        const finalX = finalPos.x;
        const finalY = finalPos.y;
        const slideX = bubble.getIsSystem()
          ? 0
          : SLIDE_OFFSET_X * (bubble.getIsAgent() ? -1 : 1);

        const animPos = this._scratchAnimPos;
        const animScale = this._scratchAnimScale;
        animate({
          duration: BUBBLE_ANIM_DURATION,
          easing: "ease-out-cubic",
          cancelSet,
          update: (t: number) => {
            animPos.x = finalX + slideX * (1 - t);
            animPos.y = finalY + SLIDE_OFFSET_Y * (1 - t);
            animPos.z = finalPos.z;
            transform.setLocalPosition(animPos);

            const s = START_SCALE + (1 - START_SCALE) * t;
            animScale.x = s;
            animScale.y = s;
            animScale.z = s;
            transform.setLocalScale(animScale);

            bubble.setOpacity(t);
          },
          ended: () => {
            transform.setLocalPosition(finalPos);
            transform.setLocalScale(vec3.one());
            bubble.setOpacity(1);
          },
        });
      }, delay);
    }
  }
}
