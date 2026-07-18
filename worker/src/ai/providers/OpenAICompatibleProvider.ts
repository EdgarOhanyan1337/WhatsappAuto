import { AIProvider } from '../AIProvider.js';
import { RateLimitError } from '../RateLimitError.js';
import { ChatMessage } from '../../types.js';

/** Reusable OpenAI-chat-completions transport for Groq and OpenRouter. */
export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    public readonly name: string,
    private readonly apiKey: string,
    private readonly endpoint: string,
    private readonly model: string,
  ) {}

  /** Generates a reply through an OpenAI-compatible chat completion endpoint. */
  async generateReply(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.55 }),
    });
    if (response.status === 429) throw new RateLimitError(this.name);
    if (!response.ok) throw new Error(`${this.name} error ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error(`${this.name} returned an empty response.`);
    return text;
  }
}

