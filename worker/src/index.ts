import { AIRouter } from './ai/AIRouter.js';
import { configuredProviderNames, createConfiguredProviders } from './ai/providerFactory.js';
import { CommandServer } from './commands/CommandServer.js';
import { config } from './config.js';
import { MemoryService } from './memory/MemoryService.js';
import { AssistantRepository } from './repositories/AssistantRepository.js';
import { supabase } from './supabaseClient.js';
import { startWhatsApp } from './whatsapp/connection.js';

/** Bootstraps the single-owner hybrid worker and all its long-lived connections. */
async function main(): Promise<void> {
  const providers = createConfiguredProviders();
  if (!providers.length) throw new Error('Set at least one AI provider credential before starting the worker.');

  const repository = new AssistantRepository(supabase);
  await repository.ensureUserDefaults(config.WORKER_USER_ID, configuredProviderNames(providers));
  const router = new AIRouter(providers, config.WORKER_USER_ID, repository);
  const memoryService = new MemoryService(router, repository);
  const commandServer = new CommandServer(config.WORKER_USER_ID, router, providers, repository);
  commandServer.start();
  await startWhatsApp({
    userId: config.WORKER_USER_ID,
    repository,
    router,
    memoryService,
  });
}

void main().catch((error: unknown) => {
  console.error('Worker startup failed', error);
  process.exitCode = 1;
});

