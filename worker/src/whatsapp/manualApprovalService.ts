import { WASocket } from '@whiskeysockets/baileys';
import { AssistantRepository } from '../repositories/AssistantRepository.js';
import { supabase } from '../supabaseClient.js';

import { RealtimeChannel } from '@supabase/supabase-js';

// Track the active channel globally in the module to allow cleaning it up on reconnects
let activeChannel: RealtimeChannel | null = null;

/** Watches approved draft updates and transmits each approved response through the active socket. */
export class ManualApprovalService {
  private readonly sentIds = new Set<string>();

  constructor(
    private readonly userId: string,
    private readonly socket: WASocket,
    private readonly repository: AssistantRepository,
  ) {}

  /** Starts the Supabase Realtime listener for dashboard-approved drafts. */
  start(): void {
    if (activeChannel) {
      void supabase.removeChannel(activeChannel);
      activeChannel = null;
    }

    const channelName = `approved-drafts-${this.userId}-${Date.now()}`;
    activeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          void this.sendApprovedDraft(String(payload.new.id));
        },
      );

    activeChannel.subscribe();
  }

  /** Sends one newly approved draft only if it belongs to this worker owner. */
  private async sendApprovedDraft(messageId: string): Promise<void> {
    if (this.sentIds.has(messageId)) return;
    const draft = await this.repository.getApprovedManualReply(messageId);
    if (!draft || draft.userId !== this.userId || !draft.content) return;
    this.sentIds.add(messageId);
    try {
      const phone = await this.repository.getConversationPhone(this.userId, draft.conversationId);
      await this.socket.sendMessage(`${phone}@s.whatsapp.net`, { text: draft.content });
    } catch (error) {
      this.sentIds.delete(messageId);
      throw error;
    }
  }
}

