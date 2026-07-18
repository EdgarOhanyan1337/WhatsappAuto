import { ChatMessage } from '../types.js';

/** Contract implemented by every supported AI provider. */
export interface AIProvider {
  readonly name: string;
  generateReply(messages: ChatMessage[]): Promise<string>;
}

