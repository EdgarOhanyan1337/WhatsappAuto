import { supabase } from '../lib/supabase';
import type { Conversation, Message } from '../types';

const PAGE_SIZE = 40;

/** Encapsulates all dashboard data access behind user-scoped Supabase calls. */
export class AssistantApi {
  /** Retrieves dashboard overview metrics and live operational state. */
  async getOverview(): Promise<{
    session: { status: string; qr_code: string | null; last_connected_at: string | null } | null;
    settings: { bot_enabled: boolean; default_mode: string } | null;
    todayCount: number;
    latestProvider: string | null;
  }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [sessionResult, settingsResult, countResult, providerResult] = await Promise.all([
      supabase
        .from('whatsapp_sessions')
        .select('status, qr_code, last_connected_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('bot_settings').select('bot_enabled, default_mode').maybeSingle(),
      supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', start.toISOString()),
      supabase
        .from('messages')
        .select('ai_provider')
        .eq('role', 'assistant')
        .not('ai_provider', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    for (const result of [sessionResult, settingsResult, countResult, providerResult]) {
      if (result.error) throw result.error;
    }
    return {
      session: sessionResult.data,
      settings: settingsResult.data,
      todayCount: countResult.count ?? 0,
      latestProvider: providerResult.data?.ai_provider ?? null,
    };
  }

  /** Retrieves ordered conversations with the contact data used by the inbox. */
  async getConversations(): Promise<Conversation[]> {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, contact_id, is_pinned, last_message_at, unread_count, contacts!inner(id, phone, display_name, bot_mode, is_blacklisted, is_whitelisted)')
      .order('is_pinned', { ascending: false })
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      contacts: Array.isArray(row.contacts) ? row.contacts[0] : row.contacts,
    })) as unknown as Conversation[];
  }

  /** Retrieves one page of chronological chat bubbles for infinite scrolling. */
  async getMessages(conversationId: string, offset: number): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, role, content, ai_provider, status, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    return (data ?? []) as Message[];
  }

  /** Clears the unread indicator once an operator opens a conversation. */
  async markConversationRead(conversationId: string): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);
    if (error) throw error;
  }

  /** Approves a draft through the server-side action that signals the worker. */
  async approveDraft(messageId: string, content: string): Promise<void> {
    const { error } = await supabase.functions.invoke('send-manual-reply', {
      body: { messageId, content },
    });
    if (error) throw error;
  }

  /** Marks a draft rejected so it is never picked up by the worker. */
  async rejectDraft(messageId: string): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .update({ status: 'rejected' })
      .eq('id', messageId)
      .eq('status', 'draft');
    if (error) throw error;
  }

  /** Requests an updated draft generated inside the private worker. */
  async regenerateDraft(messageId: string): Promise<void> {
    const { error } = await supabase.functions.invoke('regenerate-draft', { body: { messageId } });
    if (error) throw error;
  }

  /** Retrieves a contact's editable long-term memory rows. */
  async getMemories(contactId: string): Promise<Array<{ id: string; fact: string; category: string | null; is_pinned: boolean }>> {
    const { data, error } = await supabase
      .from('memories')
      .select('id, fact, category, is_pinned')
      .eq('contact_id', contactId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  /** Creates a concise durable fact for a contact. */
  async createMemory(contactId: string, fact: string): Promise<void> {
    const { error } = await supabase.from('memories').insert({ contact_id: contactId, fact, category: 'other' });
    if (error) throw error;
  }

  /** Updates one memory's text or pin state. */
  async updateMemory(id: string, values: { fact?: string; is_pinned?: boolean }): Promise<void> {
    const { error } = await supabase.from('memories').update(values).eq('id', id);
    if (error) throw error;
  }

  /** Permanently removes one contact fact. */
  async deleteMemory(id: string): Promise<void> {
    const { error } = await supabase.from('memories').delete().eq('id', id);
    if (error) throw error;
  }

  /** Retrieves ordered provider settings with the latest diagnostic log. */
  async getProviders(): Promise<Array<{ id: string; name: string; priority: number; enabled: boolean; cooldown_until: string | null }>> {
    const { data, error } = await supabase
      .from('ai_providers')
      .select('id, name, priority, enabled, cooldown_until')
      .order('priority', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Updates the whole provider priority list atomically from the dashboard's perspective. */
  async reorderProviders(providers: Array<{ id: string; priority: number }>): Promise<void> {
    await Promise.all(
      providers.map(async (provider) => {
        const { error } = await supabase
          .from('ai_providers')
          .update({ priority: provider.priority })
          .eq('id', provider.id);
        if (error) throw error;
      }),
    );
  }

  /** Enables or disables a provider without exposing any secret. */
  async setProviderEnabled(id: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.from('ai_providers').update({ enabled }).eq('id', id);
    if (error) throw error;
  }

  /** Invokes the worker's provider diagnostics through an authenticated Edge Function. */
  async testProvider(provider: string): Promise<void> {
    const { error } = await supabase.functions.invoke('test-provider', { body: { provider } });
    if (error) throw error;
  }

  /** Retrieves provider logs for transparent fallover diagnostics. */
  async getProviderLogs(): Promise<Array<{ id: string; provider: string; success: boolean; latency_ms: number | null; error_message: string | null; created_at: string }>> {
    const { data, error } = await supabase
      .from('provider_logs')
      .select('id, provider, success, latency_ms, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) throw error;
    return data ?? [];
  }

  /** Retrieves settings and contacts needed by the focused settings screen. */
  async getSettings(): Promise<{
    settings: { bot_enabled: boolean; default_mode: 'auto' | 'manual'; system_prompt: string; reply_delay_seconds: number; working_hours_start: string | null; working_hours_end: string | null } | null;
    contacts: Array<{ id: string; phone: string; display_name: string | null; is_blacklisted: boolean; is_whitelisted: boolean; bot_mode: string }>;
  }> {
    const [settingsResult, contactsResult] = await Promise.all([
      supabase.from('bot_settings').select('bot_enabled, default_mode, system_prompt, reply_delay_seconds, working_hours_start, working_hours_end').maybeSingle(),
      supabase.from('contacts').select('id, phone, display_name, is_blacklisted, is_whitelisted, bot_mode').order('created_at', { ascending: false }),
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (contactsResult.error) throw contactsResult.error;
    return { settings: settingsResult.data, contacts: contactsResult.data ?? [] };
  }

  /** Persists the complete global bot behavior form. */
  async saveSettings(values: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('bot_settings').update(values).eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '');
    if (error) throw error;
  }

  /** Changes blacklist, whitelist, or per-contact mode without leaving settings. */
  async updateContact(id: string, values: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('contacts').update(values).eq('id', id);
    if (error) throw error;
  }

  /** Flips the global bot state through a dashboard action. */
  async toggleBot(enabled: boolean): Promise<void> {
    const { error } = await supabase.functions.invoke('toggle-bot', { body: { enabled } });
    if (error) throw error;
  }
}

/** Singleton API service shared by React Query hooks. */
export const assistantApi = new AssistantApi();
