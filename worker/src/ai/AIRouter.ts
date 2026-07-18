import { AssistantRepository } from '../repositories/AssistantRepository.js';
import { ChatMessage } from '../types.js';
import { AIProvider } from './AIProvider.js';
import { RateLimitError } from './RateLimitError.js';

/** Tries enabled AI providers in dashboard priority order with cooldown-aware failover. */
export class AIRouter {
  constructor(
    private readonly providers: AIProvider[],
    private readonly userId: string,
    private readonly repository: AssistantRepository,
  ) {}

  /** Returns the first successful AI response and records every provider attempt. */
  async generateReply(messages: ChatMessage[]): Promise<{ text: string; provider: string }> {
    if (!this.providers.length) throw new Error('No AI provider is configured in the worker environment.');
    const config = await this.repository.getProviderConfiguration(this.userId);
    const configured = config
      .map((row) => ({ provider: this.providers.find((provider) => provider.name === row.name), row }))
      .filter((item): item is { provider: AIProvider; row: (typeof config)[number] } => Boolean(item.provider))
      .filter(({ row }) => !row.cooldown_until || new Date(row.cooldown_until) < new Date())
      .map(({ provider }) => provider);
    const ordered = configured.length ? configured : this.providers;

    for (const provider of ordered) {
      const startedAt = Date.now();
      try {
        const text = await provider.generateReply(messages);
        await this.repository.logProviderCall({
          userId: this.userId,
          provider: provider.name,
          success: true,
          latencyMs: Date.now() - startedAt,
          errorMessage: null,
        });
        return { text, provider: provider.name };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.repository.logProviderCall({
          userId: this.userId,
          provider: provider.name,
          success: false,
          latencyMs: Date.now() - startedAt,
          errorMessage: message,
        });
        if (error instanceof RateLimitError) {
          await this.repository.setProviderCooldown(this.userId, provider.name);
        }
      }
    }
    throw new Error('All AI providers failed or are rate-limited.');
  }
}

