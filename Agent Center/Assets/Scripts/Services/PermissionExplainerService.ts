import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
import { GoogleGenAITypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";
import { ChatMessage } from "../Types";

const TAG = "[PermissionExplainer]";
const MAX_EXPLANATION_CHARS = 80;
const MAX_CONTEXT_MESSAGES = 6;

const SYSTEM_INSTRUCTION =
  `You explain AI coding agent permission requests in plain, friendly language. ` +
  `Given a tool name, its technical description, and recent conversation context, ` +
  `write a single sentence (under ${MAX_EXPLANATION_CHARS} characters) that a non-technical user can understand. ` +
  `Focus on what the AI wants to do and why it needs this access in the context of what the user asked for. ` +
  `Do NOT use quotes or markdown. Be clear and reassuring.`;

export class PermissionExplainerService {
  static explain(
    tool: string,
    description: string,
    recentMessages: ChatMessage[] = [],
  ): Promise<string> {
    const contextLines = recentMessages
      .slice(-MAX_CONTEXT_MESSAGES)
      .filter((m) => m.sender === "user" || m.sender === "agent")
      .map((m) => `${m.sender === "user" ? "User" : "Agent"}: ${m.content}`)
      .join("\n");

    const contextSection =
      contextLines.length > 0
        ? `\n\nRecent conversation:\n${contextLines}`
        : "";

    const request: GoogleGenAITypes.Gemini.Models.GenerateContentRequest = {
      model: "gemini-3.1-flash-lite-preview",
      type: "generateContent",
      body: {
        contents: [
          {
            parts: [
              {
                text:
                  `Tool: "${tool}"\nDescription: "${description}"${contextSection}\n\n` +
                  `Explain this permission request in plain English.`,
              },
            ],
            role: "user",
          },
        ],
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 100,
        },
      },
    };

    return Gemini.models(request)
      .then((response) => {
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text || text.trim().length === 0) {
          print(`${TAG} Empty response from Gemini`);
          return description;
        }
        const trimmed = text.trim();
        print(`${TAG} Explanation: "${trimmed}"`);
        return trimmed;
      })
      .catch((error) => {
        print(`${TAG} Gemini request failed: ${error}`);
        return description;
      });
  }
}
