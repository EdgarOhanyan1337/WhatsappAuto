import { AIProvider } from '../AIProvider.js';
import { RateLimitError } from '../RateLimitError.js';
import { ChatMessage } from '../../types.js';

/** Hugging Face's OpenAI-compatible inference endpoint. */
export class HuggingFaceProvider implements AIProvider {
  readonly name = 'huggingface';

  constructor(
    private readonly apiKey: string,
    private readonly model = 'Qwen/Qwen2.5-7B-Instruct',
  ) {}

  /** Generates a reply through Hugging Face Inference Providers. */
  async generateReply(messages: ChatMessage[]): Promise<string> {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, max_tokens: 300, temperature: 0.55 }),
    });
    if (response.status === 429) throw new RateLimitError(this.name);
    if (!response.ok) throw new Error(`Hugging Face error ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Hugging Face returned an empty response.');
    return text;
  }
}

