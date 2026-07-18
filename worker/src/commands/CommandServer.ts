import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AIRouter } from '../ai/AIRouter.js';
import { AIProvider } from '../ai/AIProvider.js';
import { config } from '../config.js';
import { buildPrompt } from '../memory/buildPrompt.js';
import { AssistantRepository } from '../repositories/AssistantRepository.js';

/** Exposes authenticated internal commands for Supabase Edge Functions, never for browsers directly. */
export class CommandServer {
  private server: Server | null = null;

  constructor(
    private readonly userId: string,
    private readonly router: AIRouter,
    private readonly providers: AIProvider[],
    private readonly repository: AssistantRepository,
  ) {}

  /** Starts the private health and command HTTP server used by Fly.io and Edge Functions. */
  start(): void {
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.server.listen(config.PORT, '0.0.0.0', () => {
      console.info(`Worker health endpoint listening on ${config.PORT}.`);
    });
  }

  /** Gracefully closes the private command server. */
  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => (error ? reject(error) : resolve()));
    });
  }

  /** Routes a health probe or a token-protected dashboard command. */
  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method === 'GET' && request.url === '/health') {
      this.respond(response, 200, { status: 'ok' });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/commands') {
      this.respond(response, 404, { error: 'Not found' });
      return;
    }
    if (request.headers.authorization !== `Bearer ${config.WORKER_COMMAND_TOKEN}`) {
      this.respond(response, 401, { error: 'Unauthorized' });
      return;
    }
    try {
      const body = await this.readJson(request);
      if (body.action === 'regenerate-draft' && typeof body.messageId === 'string') {
        const reply = await this.regenerateDraft(body.messageId);
        this.respond(response, 200, reply);
        return;
      }
      if (body.action === 'test-provider' && typeof body.provider === 'string') {
        const reply = await this.testProvider(body.provider);
        this.respond(response, 200, reply);
        return;
      }
      this.respond(response, 400, { error: 'Invalid command payload' });
    } catch (error) {
      console.error('Command failed', error);
      this.respond(response, 500, { error: error instanceof Error ? error.message : 'Command failed' });
    }
  }

  /** Regenerates a draft with the worker's private AI credentials and conversation context. */
  private async regenerateDraft(messageId: string): Promise<{ content: string; provider: string }> {
    const draft = await this.repository.getDraftForUser(this.userId, messageId);
    if (!draft) throw new Error('Draft not found.');
    const settings = await this.repository.getBotSettings(this.userId);
    const history = await this.repository.getConversationHistory(draft.conversationId);
    const reply = await this.router.generateReply(buildPrompt(settings.system_prompt, [], history));
    await this.repository.updateDraft(draft.id, reply.text, reply.provider);
    return { content: reply.text, provider: reply.provider };
  }

  /** Tests one configured provider and records its result in the normal provider log. */
  private async testProvider(providerName: string): Promise<{ provider: string; text: string }> {
    const provider = this.providers.find((item) => item.name === providerName);
    if (!provider) throw new Error('Provider is not configured in the worker environment.');
    const startedAt = Date.now();
    try {
      const text = await provider.generateReply([{ role: 'user', content: 'Reply only with: connected' }]);
      await this.repository.logProviderCall({
        userId: this.userId,
        provider: provider.name,
        success: true,
        latencyMs: Date.now() - startedAt,
        errorMessage: null,
      });
      return { provider: provider.name, text };
    } catch (error) {
      await this.repository.logProviderCall({
        userId: this.userId,
        provider: provider.name,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Reads a bounded JSON request body from an internal POST request. */
  private async readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 16_384) throw new Error('Request body is too large.');
      chunks.push(buffer);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object expected.');
    return value as Record<string, unknown>;
  }

  /** Sends a JSON response with an explicit content type and status code. */
  private respond(response: ServerResponse, status: number, payload: unknown): void {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }
}

