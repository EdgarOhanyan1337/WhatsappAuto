import { describe, expect, it, vi } from 'vitest';
import { AIRouter } from '../src/ai/AIRouter.js';
import { AIProvider } from '../src/ai/AIProvider.js';
import { RateLimitError } from '../src/ai/RateLimitError.js';
import { AssistantRepository } from '../src/repositories/AssistantRepository.js';

/** Verifies the most important resilience promise: a rate-limited provider never blocks a reply. */
describe('AIRouter', () => {
  it('cools down a rate-limited provider and uses the next prioritized provider', async () => {
    const gemini: AIProvider = { name: 'gemini', generateReply: vi.fn().mockRejectedValue(new RateLimitError('gemini')) };
    const groq: AIProvider = { name: 'groq', generateReply: vi.fn().mockResolvedValue('Reply from Groq') };
    const repository = {
      getProviderConfiguration: vi.fn().mockResolvedValue([
        { name: 'gemini', priority: 1, enabled: true, cooldown_until: null },
        { name: 'groq', priority: 2, enabled: true, cooldown_until: null },
      ]),
      logProviderCall: vi.fn().mockResolvedValue(undefined),
      setProviderCooldown: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssistantRepository;
    const router = new AIRouter([gemini, groq], 'user-id', repository);

    await expect(router.generateReply([{ role: 'user', content: 'Hello' }])).resolves.toEqual({
      text: 'Reply from Groq',
      provider: 'groq',
    });
    expect(repository.setProviderCooldown).toHaveBeenCalledWith('user-id', 'gemini');
    expect(groq.generateReply).toHaveBeenCalledOnce();
  });
});

