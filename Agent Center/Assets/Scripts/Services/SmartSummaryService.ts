import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
import { GoogleGenAITypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";
import { ChatMessage } from "../Types";

const TAG = "[SmartSummary]";
const MAX_CONTEXT_MESSAGES = 8;
const MAX_SUMMARY_CHARS = 55;

const SYSTEM_INSTRUCTION =
  `You summarize coding agent task notifications. ` +
  `Given the conversation between a user and an AI coding agent, ` +
  `produce a single concise summary sentence (under ${MAX_SUMMARY_CHARS} characters) ` +
  `describing what the agent accomplished. ` +
  `Do NOT use quotes or markdown. Be specific and action-oriented.`;

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
            `Summarize what the agent did in under ${MAX_SUMMARY_CHARS} characters.`,
        },
      ],
      role: "user",
    },
  ];
}

export class SmartSummaryService {
  static summarizeNotification(
    topicTitle: string,
    messages: ChatMessage[],
    fallback: string,
  ): Promise<string> {
    if (messages.length === 0) {
      return Promise.resolve(fallback);
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
          temperature: 0.3,
          maxOutputTokens: 80,
        },
      },
    };

    return Gemini.models(request)
      .then((response) => {
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text || text.trim().length === 0) {
          print(`${TAG} Empty response from Gemini, using fallback`);
          return fallback;
        }
        const trimmed = text.trim();
        print(`${TAG} Smart summary: "${trimmed}"`);
        return trimmed;
      })
      .catch((error) => {
        print(`${TAG} Gemini request failed: ${error}`);
        return fallback;
      });
  }
}
