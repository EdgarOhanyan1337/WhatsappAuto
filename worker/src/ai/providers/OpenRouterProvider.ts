import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

/** OpenRouter free-model implementation. */
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string) {
    super(
      'openrouter',
      apiKey,
      'https://openrouter.ai/api/v1/chat/completions',
      'qwen/qwen3-30b-a3b:free',
    );
  }
}

