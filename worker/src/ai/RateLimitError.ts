/** Signals an upstream 429 response so the router can place the provider on cooldown. */
export class RateLimitError extends Error {
  constructor(public readonly provider: string) {
    super(`${provider} rate limited`);
    this.name = 'RateLimitError';
  }
}

