import { AIProvider } from '../AIProvider.js';
import { RateLimitError } from '../RateLimitError.js';
import { ChatMessage } from '../../types.js';

/** Gemini implementation using Google's generateContent endpoint. */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model = 'gemini-2.5-flash',
  ) {}

  /** Generates one concise reply from a normalized conversation. */
  async generateReply(messages: ChatMessage[]): Promise<string> {
    const systemMessage = messages.find((message) => message.role === 'system')?.content ?? '';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
          systemInstruction: { parts: [{ text: systemMessage }] },
        }),
      },
    );
    if (response.status === 429) throw new RateLimitError(this.name);
    if (!response.ok) throw new Error(`Gemini error ${response.status}`);
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('Gemini returned an empty response.');
    return text;
  }
}

