/** A normalized chat message accepted by every AI provider. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Supported external model-provider identifiers. */
export type ProviderName = 'gemini' | 'groq' | 'openrouter' | 'huggingface' | 'ollama';

/** A persisted assistant message awaiting explicit dashboard approval. */
export interface ManualReply {
  id: string;
  conversationId: string;
  content: string;
  userId: string;
}

