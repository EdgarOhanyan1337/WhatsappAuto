import { SupabaseClient } from '@supabase/supabase-js';
import { ChatMessage, ManualReply, ProviderName } from '../types.js';

type Contact = {
  id: string;
  phone: string;
  is_blacklisted: boolean;
  is_whitelisted: boolean;
  bot_mode: 'inherit' | 'auto' | 'manual' | 'off';
};

type Conversation = { id: string; unread_count: number };

type BotSettings = {
  bot_enabled: boolean;
  default_mode: 'auto' | 'manual';
  system_prompt: string;
  reply_delay_seconds: number;
  working_hours_start: string | null;
  working_hours_end: string | null;
};

type ProviderConfig = {
  name: ProviderName;
  priority: number;
  enabled: boolean;
  cooldown_until: string | null;
};

/** Centralizes all server-side database operations for the assistant worker. */
export class AssistantRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** Ensures the user has a session row, core bot settings, and provider ordering. */
  async ensureUserDefaults(userId: string, providers: ProviderName[]): Promise<void> {
    const { data: profile, error: profileError } = await this.client
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new Error(`No profile exists for WORKER_USER_ID ${userId}.`);

    const { error: settingsError } = await this.client.from('bot_settings').upsert(
      { user_id: userId },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
    if (settingsError) throw settingsError;

    const rows = providers.map((name, index) => ({
      user_id: userId,
      name,
      priority: index + 1,
      enabled: true,
    }));
    if (rows.length) {
      const { error } = await this.client.from('ai_providers').upsert(rows, {
        onConflict: 'user_id,name',
        ignoreDuplicates: true,
      });
      if (error) throw error;
    }

    const { data: session, error: sessionError } = await this.client
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) {
      const { error } = await this.client.from('whatsapp_sessions').insert({ user_id: userId });
      if (error) throw error;
    }
  }

  /** Updates the current WhatsApp session's visible connection state. */
  async updateSession(userId: string, values: Record<string, unknown>): Promise<void> {
    const { error } = await this.client
      .from('whatsapp_sessions')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) throw error;
  }

  /** Returns an existing contact or creates a scoped contact for an inbound phone number. */
  async findOrCreateContact(userId: string, phone: string): Promise<Contact> {
    const { data, error } = await this.client
      .from('contacts')
      .upsert({ user_id: userId, phone }, { onConflict: 'user_id,phone' })
      .select('id, phone, is_blacklisted, is_whitelisted, bot_mode')
      .single();
    if (error) throw error;
    return data as Contact;
  }

  /** Returns the contact's single active conversation, creating it if necessary. */
  async findOrCreateConversation(userId: string, contactId: string): Promise<Conversation> {
    const { data: existing, error: existingError } = await this.client
      .from('conversations')
      .select('id, unread_count')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing as Conversation;

    const { data, error } = await this.client
      .from('conversations')
      .insert({ user_id: userId, contact_id: contactId })
      .select('id, unread_count')
      .single();
    if (error) throw error;
    return data as Conversation;
  }

  /** Inserts a normalized chat message and returns its database id. */
  async insertMessage(input: {
    conversationId: string;
    role: ChatMessage['role'];
    content: string;
    status: 'draft' | 'sent' | 'rejected' | 'failed';
    provider?: string;
  }): Promise<string> {
    const { data, error } = await this.client
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
        status: input.status,
        ai_provider: input.provider ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return String(data.id);
  }

  /** Updates timing and unread state after an inbound message is received. */
  async recordInboundActivity(conversation: Conversation): Promise<void> {
    const { error } = await this.client
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: conversation.unread_count + 1,
      })
      .eq('id', conversation.id);
    if (error) throw error;
  }

  /** Reads bot behavior settings for one owner. */
  async getBotSettings(userId: string): Promise<BotSettings> {
    const { data, error } = await this.client
      .from('bot_settings')
      .select('bot_enabled, default_mode, system_prompt, reply_delay_seconds, working_hours_start, working_hours_end')
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return data as BotSettings;
  }

  /** Loads the recent conversation messages in chronological prompt order. */
  async getConversationHistory(conversationId: string, limit = 30): Promise<ChatMessage[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .in('status', ['sent', 'draft'])
      .not('content', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? [])
      .reverse()
      .filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'system')
      .map((message) => ({ role: message.role as ChatMessage['role'], content: String(message.content) }));
  }

  /** Loads durable facts that should be injected into prompts. */
  async getMemories(contactId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from('memories')
      .select('fact')
      .eq('contact_id', contactId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => String(row.fact));
  }

  /** Adds only facts that do not exactly duplicate an existing fact for the contact. */
  async insertUniqueMemories(contactId: string, facts: string[]): Promise<void> {
    const current = await this.getMemories(contactId);
    const normalized = new Set(current.map((fact) => fact.trim().toLowerCase()));
    const unique = facts
      .map((fact) => fact.trim().replace(/\s+/g, ' '))
      .filter((fact) => fact.length > 2 && fact.length <= 500)
      .filter((fact) => !normalized.has(fact.toLowerCase()));
    if (!unique.length) return;

    const { error } = await this.client.from('memories').insert(
      unique.map((fact) => ({ contact_id: contactId, fact, category: 'other' })),
    );
    if (error) throw error;
  }

  /** Counts conversation messages to decide when memory extraction is due. */
  async countMessages(conversationId: string): Promise<number> {
    const { count, error } = await this.client
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversationId);
    if (error) throw error;
    return count ?? 0;
  }

  /** Returns active provider configuration in priority order. */
  async getProviderConfiguration(userId: string): Promise<ProviderConfig[]> {
    const { data, error } = await this.client
      .from('ai_providers')
      .select('name, priority, enabled, cooldown_until')
      .eq('user_id', userId)
      .eq('enabled', true)
      .order('priority', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProviderConfig[];
  }

  /** Records a provider attempt for visibility in the dashboard. */
  async logProviderCall(input: {
    userId: string;
    provider: string;
    success: boolean;
    latencyMs: number;
    errorMessage: string | null;
  }): Promise<void> {
    const { error } = await this.client.from('provider_logs').insert({
      user_id: input.userId,
      provider: input.provider,
      success: input.success,
      latency_ms: input.latencyMs,
      error_message: input.errorMessage,
    });
    if (error) throw error;
  }

  /** Starts a five-minute provider cooldown after an upstream rate limit. */
  async setProviderCooldown(userId: string, name: string): Promise<void> {
    const { error } = await this.client
      .from('ai_providers')
      .update({ cooldown_until: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
      .eq('user_id', userId)
      .eq('name', name);
    if (error) throw error;
  }

  /** Returns a draft that belongs to the supplied user and its conversation context. */
  async getDraftForUser(userId: string, messageId: string): Promise<ManualReply | null> {
    const { data, error } = await this.client
      .from('messages')
      .select('id, conversation_id, content, status, role, conversations!inner(user_id)')
      .eq('id', messageId)
      .eq('status', 'draft')
      .eq('role', 'assistant')
      .eq('conversations.user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: String(data.id),
      conversationId: String(data.conversation_id),
      content: String(data.content ?? ''),
      userId,
    };
  }

  /** Replaces an existing draft with a newly generated version. */
  async updateDraft(messageId: string, content: string, provider: string): Promise<void> {
    const { error } = await this.client
      .from('messages')
      .update({ content, ai_provider: provider })
      .eq('id', messageId)
      .eq('status', 'draft');
    if (error) throw error;
  }

  /** Looks up a just-approved draft so the worker can transmit it once. */
  async getApprovedManualReply(messageId: string): Promise<ManualReply | null> {
    const { data, error } = await this.client
      .from('messages')
      .select('id, conversation_id, content, role, status, conversations!inner(user_id, contacts!inner(phone))')
      .eq('id', messageId)
      .eq('role', 'assistant')
      .eq('status', 'sent')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const conversation = data.conversations as unknown as { user_id: string; contacts: { phone: string } };
    return {
      id: String(data.id),
      conversationId: String(data.conversation_id),
      content: String(data.content ?? ''),
      userId: conversation.user_id,
    };
  }

  /** Gets the WhatsApp phone number for a conversation owned by a user. */
  async getConversationPhone(userId: string, conversationId: string): Promise<string> {
    const { data, error } = await this.client
      .from('conversations')
      .select('contacts!inner(phone)')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    return String((data.contacts as unknown as { phone: string }).phone);
  }
}

