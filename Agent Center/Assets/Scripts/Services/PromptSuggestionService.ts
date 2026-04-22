import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
import { GoogleGenAITypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";
import { ChatMessage } from "../Types";

const TAG = "[PromptSuggestions]";
const MAX_CONTEXT_MESSAGES = 8;
const SUGGESTION_COUNT = 3;
const MAX_SUGGESTION_CHARS = 60;

const SYSTEM_INSTRUCTION =
  `You generate follow-up prompt suggestions for a user chatting with an AI coding agent. ` +
  `Given the conversation history, produce exactly ${SUGGESTION_COUNT} short follow-up prompts ` +
  `the user might want to send next. Each prompt must be under ${MAX_SUGGESTION_CHARS} characters. ` +
  `Return ONLY a JSON array of ${SUGGESTION_COUNT} strings, no markdown or explanation.`;

function buildContents(
  topicTitle: string,
  messages: ChatMessage[],
): GoogleGenAITypes.Common.Content[] {
  const recent = messages.slice(-MAX_CONTEXT_MESSAGES);

  const transcript = recent
    .map((m) => `${m.sender === "user" ? "User" : "Agent"}: ${m.content}`)
    .join("\n");

  return [
    {
      parts: [
        {
          text:
            `Topic: "${topicTitle}"\n\nConversation:\n${transcript}\n\n` +
            `Suggest ${SUGGESTION_COUNT} follow-up prompts as a JSON array of strings.`,
        },
      ],
      role: "user",
    },
  ];
}

function parseSuggestions(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return (parsed as string[])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim().slice(0, MAX_SUGGESTION_CHARS))
      .slice(0, SUGGESTION_COUNT);
  } catch {
    print(`${TAG} Failed to parse suggestions JSON`);
    return [];
  }
}

export class PromptSuggestionService {
  static generateSuggestions(
    topicTitle: string,
    messages: ChatMessage[],
  ): Promise<string[]> {
    if (messages.length === 0) {
      return Promise.resolve([]);
    }

    const request: GoogleGenAITypes.Gemini.Models.GenerateContentRequest = {
      model: "gemini-3.1-flash-lite-preview",
      type: "generateContent",
      body: {
        contents: buildContents(topicTitle, messages),
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200,
        },
      },
    };

    return Gemini.models(request)
      .then((response) => {
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text || text.trim().length === 0) {
          print(`${TAG} Empty response from Gemini`);
          return [];
        }
        const suggestions = parseSuggestions(text);
        print(`${TAG} Generated ${suggestions.length} suggestions`);
        return suggestions;
      })
      .catch((error) => {
        print(`${TAG} Gemini request failed: ${error}`);
        return [];
      });
  }
}
