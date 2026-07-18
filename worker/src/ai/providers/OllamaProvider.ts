import { AIProvider } from '../AIProvider.js';
import { ChatMessage } from '../../types.js';

/** Local Ollama fallback for a self-hosted model endpoint. */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';

  constructor(
    private readonly baseUrl: string,
    private readonly model = 'llama3.2:3b',
  ) {}

  /** Generates a reply from an Ollama chat endpoint. */
  async generateReply(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (response.status === 429) throw new Error('ollama rate limited');
    if (!response.ok) throw new Error(`Ollama error ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim();
    if (!text) throw new Error('Ollama returned an empty response.');
    return text;
  }
}

