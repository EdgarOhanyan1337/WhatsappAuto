import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

/** Groq's fast OpenAI-compatible Llama endpoint. */
export class GroqProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super('groq', apiKey, 'https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile');
  }
}

