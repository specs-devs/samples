/**
 * Specs Inc. 2026
 * Fast Deck Extensions component for the Agentic Playground Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {SummarySection} from "../Agents/AgentTypes"
import {FastDeckController} from "./FastDeckController"

/**
 * FastDeckExtensions – static utility class for controlling a FastDeckController.
 *
 * Drop-in replacement for SummaryExtensions: no SpectaclesUIKitBeta dependency.
 * Mirrors the same static method signatures so SummaryBridge only needs:
 *   1. Change its @input type from SummaryComponent → FastDeckController
 *   2. Change its import from SummaryExtensions    → FastDeckExtensions
 *
 * Static API:
 *   addSummaryCard(controller, section, index)    – add one SummarySection as a card
 *   updateSummaryCards(controller, sections)      – add multiple SummarySections
 *   clearSummaryCards(controller)                 – destroy all cards and reset state
 *   isReady(controller)                           – true when controller is initialized
 *   getCardCount(controller)                      – total number of cards
 *   getCardInfo(controller, index)                – debug info for a card
 */
export class FastDeckExtensions {
  private static logger: Logger | null = null

  public static setLogger(logger: Logger): void {
    FastDeckExtensions.logger = logger
  }

  /**
   * Add a SummarySection as a deck card.
   * The `index` parameter is accepted for API compatibility with SummaryExtensions
   * but is unused – cards are always appended at the end.
   * Returns true on success, false otherwise.
   */
  public static addSummaryCard(controller: FastDeckController, section: SummarySection, index: number): boolean {
    if (!controller || !section) {
      FastDeckExtensions.logger?.info(
        `FastDeckExtensions: addSummaryCard – invalid parameters (controller: ${!!controller}, section: ${!!section})`
      )
      return false
    }

    if (!controller.isReady()) {
      FastDeckExtensions.logger?.info("FastDeckExtensions: addSummaryCard – controller not ready yet")
      return false
    }

    const cardIndex = controller.addSummarySection(section)
    const success = cardIndex >= 0
    FastDeckExtensions.logger?.info(
      `FastDeckExtensions: addSummaryCard – ${success ? "success" : "failed"} at deck index ${cardIndex} (requested index ${index})`
    )
    return success
  }

  /**
   * Add multiple SummarySections as deck cards.
   * Returns the number of cards successfully added.
   */
  public static updateSummaryCards(controller: FastDeckController, sections: SummarySection[]): number {
    if (!controller || !sections) return 0

    let added = 0
    for (let i = 0; i < sections.length; i++) {
      if (FastDeckExtensions.addSummaryCard(controller, sections[i], i)) {
        added++
      }
    }

    FastDeckExtensions.logger?.info(`FastDeckExtensions: updateSummaryCards – added ${added} of ${sections.length} cards`)
    return added
  }

  /**
   * Destroy all deck cards and reset state.
   * Returns true on success, false otherwise.
   */
  public static clearSummaryCards(controller: FastDeckController): boolean {
    if (!controller) {
      FastDeckExtensions.logger?.info("FastDeckExtensions: clearSummaryCards – invalid controller")
      return false
    }
    return controller.clearAllCards()
  }

  /**
   * Returns true when the controller is initialized and its FastDeck is set.
   */
  public static isReady(controller: FastDeckController): boolean {
    if (!controller) return false
    return controller.isReady()
  }

  /**
   * Returns the total number of cards in the deck.
   */
  public static getCardCount(controller: FastDeckController): number {
    if (!controller) return 0
    return controller.getCardCount()
  }

  /**
   * Returns debug info for the card at the given index, or null if out of range.
   * Shape matches the return value of SummaryExtensions.getCardInfo for compatibility.
   */
  public static getCardInfo(
    controller: FastDeckController,
    index: number
  ): {index: number; cardName: string; enabled: boolean; position: vec3; title: string; content: string} | null {
    if (!controller) return null

    try {
      const deckAny = (controller as any).fastDeck as any
      if (!deckAny || !deckAny.cards || index < 0 || index >= deckAny.cards.length) return null

      const card: SceneObject = deckAny.cards[index]
      if (!card) return null

      const meta = controller.getCardMeta(index)
      return {
        index,
        cardName: card.name,
        enabled: card.enabled,
        position: card.getTransform().getLocalPosition(),
        title: meta ? meta.title : "",
        content: meta ? meta.content : ""
      }
    } catch (error) {
      FastDeckExtensions.logger?.info(`FastDeckExtensions: getCardInfo – error: ${error}`)
      return null
    }
  }
}
