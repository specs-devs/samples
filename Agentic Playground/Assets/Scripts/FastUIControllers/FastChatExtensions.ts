/**
 * Specs Inc. 2026
 * Fast Chat Extensions component for the Agentic Playground Spectacles lens.
 */
import {Logger} from "Utilities.lspkg/Scripts/Utils/Logger"
import {FastChatController} from "./FastChatController"

/**
 * FastChatExtensions – static utility class for controlling a FastChatController.
 *
 * Drop-in replacement for ChatExtensions: no SpectaclesUIKitBeta dependency.
 * Mirrors the same static method signatures so ChatBridge only needs:
 *   1. Change its @input type from ChatComponent  → FastChatController
 *   2. Change its import from ChatExtensions      → FastChatExtensions
 *
 * Static API:
 *   addUserCard(controller, message)  – add a user message card
 *   addBotCard(controller, message)   – add a bot message card
 *   clearAllCards(controller)         – destroy all cards and reset state
 *   isReady(controller)               – true when controller is initialized
 *   getCardCount(controller)          – total number of cards
 */
export class FastChatExtensions {
  private static logger: Logger | null = null

  public static setLogger(logger: Logger): void {
    FastChatExtensions.logger = logger
  }

  /**
   * Add a user message card.
   * Returns true on success, false otherwise.
   */
  public static addUserCard(controller: FastChatController, message: string): boolean {
    if (!controller || !message) {
      FastChatExtensions.logger?.info("FastChatExtensions: addUserCard – invalid controller or empty message")
      return false
    }
    return controller.addUserCard(message)
  }

  /**
   * Add a bot message card.
   * Returns true on success, false otherwise.
   */
  public static addBotCard(controller: FastChatController, message: string): boolean {
    if (!controller || !message) {
      FastChatExtensions.logger?.info("FastChatExtensions: addBotCard – invalid controller or empty message")
      return false
    }
    return controller.addBotCard(message)
  }

  /**
   * Destroy all cards and reset state.
   * Returns true on success, false otherwise.
   */
  public static clearAllCards(controller: FastChatController): boolean {
    if (!controller) {
      FastChatExtensions.logger?.info("FastChatExtensions: clearAllCards – invalid controller")
      return false
    }
    return controller.clearAllCards()
  }

  /**
   * Returns true when the controller is initialized and its FastChat is set.
   */
  public static isReady(controller: FastChatController): boolean {
    if (!controller) return false
    return controller.isReady()
  }

  /**
   * Returns the total number of cards currently in the chat.
   */
  public static getCardCount(controller: FastChatController): number {
    if (!controller) return 0
    return controller.getCardCount()
  }

  /**
   * Returns the text content of the card at the given index, or empty string if out of range.
   */
  public static getCardMessage(controller: FastChatController, index: number): string {
    if (!controller) return ""
    return controller.getCardMessage(index)
  }
}
