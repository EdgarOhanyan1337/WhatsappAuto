import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AssistantRepository } from '../src/repositories/AssistantRepository.js';

const url = process.env.SUPABASE_TEST_URL;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = Boolean(url && serviceRoleKey);
let admin: SupabaseClient;
let repository: AssistantRepository;
let userId = '';

/** Exercises the repository against a real local Supabase instance when test credentials are supplied. */
describe.skipIf(!enabled)('message persistence integration', () => {
  beforeAll(async () => {
    admin = createClient(url!, serviceRoleKey!, { auth: { autoRefreshToken: false, persistSession: false } });
    const email = `worker-test-${crypto.randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: 'Testing-password-123!', email_confirm: true });
    if (error || !data.user) throw error ?? new Error('Test user was not created');
    userId = data.user.id;
    repository = new AssistantRepository(admin);
    await repository.ensureUserDefaults(userId, ['gemini']);
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('persists an inbound conversation in the exact schema shape', async () => {
    const contact = await repository.findOrCreateContact(userId, '15551234567');
    const conversation = await repository.findOrCreateConversation(userId, contact.id);
    await repository.insertMessage({ conversationId: conversation.id, role: 'user', content: 'Hello', status: 'sent' });
    await repository.recordInboundActivity(conversation);
    await expect(repository.getConversationHistory(conversation.id)).resolves.toEqual([
      { role: 'user', content: 'Hello' },
    ]);
  });
});

