import { Gemini } from "RemoteServiceGateway.lspkg/HostedExternal/Gemini";
import { GoogleGenAITypes } from "RemoteServiceGateway.lspkg/HostedExternal/GoogleGenAITypes";

const TAG = "[TopicRenaming]";
const MAX_TITLE_WORDS = 4;

const SYSTEM_INSTRUCTION =
  `You generate short titles for coding agent conversations. ` +
  `Given the user's first message to an AI coding agent, ` +
  `produce a concise title of ${MAX_TITLE_WORDS} words or fewer ` +
  `that captures the intent of the task. ` +
  `Do NOT use quotes, markdown, or punctuation. ` +
  `Return ONLY the title text, nothing else.`;

function buildContents(
  userMessage: string,
): GoogleGenAITypes.Common.Content[] {
  return [
    {
      parts: [
        {
          text:
            `User message:\n"${userMessage}"\n\n` +
            `Generate a title of ${MAX_TITLE_WORDS} words or fewer.`,
        },
      ],
      role: "user",
    },
  ];
}

function sanitizeTitle(raw: string): string {
  return raw
    .replace(/["""''`]/g, "")
    .replace(/[.!?:;,]+$/g, "")
    .trim();
}

export class TopicRenamingService {
  static generateTitle(
    userMessage: string,
    fallback: string,
  ): Promise<string> {
    if (userMessage.trim().length === 0) {
      return Promise.resolve(fallback);
    }

    const request: GoogleGenAITypes.Gemini.Models.GenerateContentRequest = {
      model: "gemini-3.1-flash-lite-preview",
      type: "generateContent",
      body: {
        contents: buildContents(userMessage),
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 30,
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
        const title = sanitizeTitle(text);
        if (title.length === 0) return fallback;
        print(`${TAG} Generated title: "${title}"`);
        return title;
      })
      .catch((error) => {
        print(`${TAG} Gemini request failed: ${error}`);
        return fallback;
      });
  }
}
