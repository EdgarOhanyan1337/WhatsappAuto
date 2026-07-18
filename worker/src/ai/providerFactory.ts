import { config } from '../config.js';
import { ProviderName } from '../types.js';
import { AIProvider } from './AIProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';
import { GroqProvider } from './providers/GroqProvider.js';
import { HuggingFaceProvider } from './providers/HuggingFaceProvider.js';
import { OllamaProvider } from './providers/OllamaProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';

/** Builds only providers with usable server-side credentials or an explicit local endpoint. */
export function createConfiguredProviders(): AIProvider[] {
  const providers: AIProvider[] = [];
  if (config.GEMINI_API_KEY) providers.push(new GeminiProvider(config.GEMINI_API_KEY));
  if (config.GROQ_API_KEY) providers.push(new GroqProvider(config.GROQ_API_KEY));
  if (config.OPENROUTER_API_KEY) providers.push(new OpenRouterProvider(config.OPENROUTER_API_KEY));
  if (config.HUGGINGFACE_API_KEY) providers.push(new HuggingFaceProvider(config.HUGGINGFACE_API_KEY));
  if (config.OLLAMA_BASE_URL) providers.push(new OllamaProvider(config.OLLAMA_BASE_URL));
  return providers;
}

/** Narrows configured AI providers to names used by the database schema. */
export function configuredProviderNames(providers: AIProvider[]): ProviderName[] {
  return providers
    .map((provider) => provider.name)
    .filter((name): name is ProviderName =>
      ['gemini', 'groq', 'openrouter', 'huggingface', 'ollama'].includes(name),
    );
}

