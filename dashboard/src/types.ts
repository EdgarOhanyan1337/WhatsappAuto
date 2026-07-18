/** Navigation destinations available in the assistant dashboard. */
export type Page = 'overview' | 'conversations' | 'memories' | 'providers' | 'settings';

/** The minimal conversation data required for the conversations surface. */
export interface Conversation {
  id: string;
  contact_id: string;
  is_pinned: boolean;
  last_message_at: string | null;
  unread_count: number;
  contacts: {
    id: string;
    phone: string;
    display_name: string | null;
    bot_mode: 'inherit' | 'auto' | 'manual' | 'off';
    is_blacklisted: boolean;
    is_whitelisted: boolean;
  };
}

/** A visible chat bubble stored in the messages table. */
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string | null;
  ai_provider: string | null;
  status: 'draft' | 'sent' | 'rejected' | 'failed';
  created_at: string;
}

