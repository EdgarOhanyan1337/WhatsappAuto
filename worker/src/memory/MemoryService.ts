import { AIRouter } from '../ai/AIRouter.js';
import { AssistantRepository } from '../repositories/AssistantRepository.js';
import { ChatMessage } from '../types.js';

/** Extracts durable contact facts every ten messages without polluting the main reply prompt. */
export class MemoryService {
  constructor(
    private readonly router: AIRouter,
    private readonly repository: AssistantRepository,
  ) {}

  /** Extracts and persists any newly learned durable facts from a conversation snapshot. */
  async extractIfDue(contactId: string, conversationId: string): Promise<void> {
    const messageCount = await this.repository.countMessages(conversationId);
    if (messageCount === 0 || messageCount % 10 !== 0) return;

    const history = await this.repository.getConversationHistory(conversationId, 40);
    if (!history.length) return;
    const result = await this.router.generateReply(this.createExtractionPrompt(history));
    const facts = this.parseFacts(result.text);
    await this.repository.insertUniqueMemories(contactId, facts);
  }

  /** Creates a constrained JSON-only prompt for long-term memory extraction. */
  private createExtractionPrompt(history: ChatMessage[]): ChatMessage[] {
    return [
      {
        role: 'system',
        content:
          'Read this conversation. Extract only new durable facts about the contact: job, preferences, upcoming plans, promises made, or important dates. Return a JSON array of short strings. Return [] when there are no durable facts. Do not include markdown or any other text.',
      },
      ...history,
    ];
  }

  /** Parses a model response defensively into a bounded list of facts. */
  private parseFacts(response: string): string[] {
    const cleaned = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const value: unknown = JSON.parse(cleaned);
      if (!Array.isArray(value)) return [];
      return value.filter((item): item is string => typeof item === 'string').slice(0, 10);
    } catch {
      return [];
    }
  }
}

