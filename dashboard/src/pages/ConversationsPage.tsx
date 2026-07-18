import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronUp, MoreHorizontal, Pencil, RotateCw, Search, Send, X } from 'lucide-react';
import { assistantApi } from '../data/AssistantApi';
import { formatTimestamp, initials } from '../lib/format';
import type { Conversation, Message } from '../types';
import { useUiStore } from '../stores/uiStore';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { StatusPill } from '../components/StatusPill';

/** Renders the live inbox and Telegram-like conversation experience with draft actions. */
export function ConversationsPage(): JSX.Element {
  const { selectedConversationId, selectConversation } = useUiStore();
  const { data: conversations, isLoading } = useQuery({ queryKey: ['conversations'], queryFn: () => assistantApi.getConversations() });
  const [search, setSearch] = useState('');
  const selected = conversations?.find((conversation) => conversation.id === selectedConversationId) ?? conversations?.[0];
  useEffect(() => { if (!selectedConversationId && conversations?.[0]) selectConversation(conversations[0].id); }, [conversations, selectedConversationId, selectConversation]);
  const filtered = useMemo(() => (conversations ?? []).filter((conversation) => {
    const candidate = conversation.contacts.display_name ?? conversation.contacts.phone;
    return candidate.toLowerCase().includes(search.toLowerCase());
  }), [conversations, search]);
  if (isLoading) return <LoadingState />;
  return <section className="inbox-layout"><aside className="conversation-list"><header><p className="eyebrow">INBOX</p><h1>Conversations</h1><div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people" /></div></header><div className="conversation-scroll">{filtered.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} active={conversation.id === selected?.id} onSelect={() => selectConversation(conversation.id)} />)}{!filtered.length && <EmptyState title="No conversations yet" detail="Incoming WhatsApp messages appear here instantly." />}</div></aside>{selected ? <ConversationView conversation={selected} /> : <div className="chat-empty"><EmptyState title="Choose a conversation" detail="Select a contact to review messages and drafts." /></div>}</section>;
}

/** Renders a contact row in the prioritized conversation list. */
function ConversationRow({ conversation, active, onSelect }: { conversation: Conversation; active: boolean; onSelect: () => void }): JSX.Element {
  const name = conversation.contacts.display_name ?? `+${conversation.contacts.phone}`;
  return <button className={active ? 'conversation-row conversation-row--active' : 'conversation-row'} onClick={onSelect}><span className="avatar">{initials(name)}</span><span className="conversation-row__body"><span><strong>{name}</strong><time>{formatTimestamp(conversation.last_message_at)}</time></span><small>{conversation.contacts.bot_mode === 'manual' ? 'Approval required' : conversation.contacts.bot_mode === 'off' ? 'Replies paused' : 'AI protected'}</small></span>{conversation.unread_count > 0 && <span className="unread-count">{conversation.unread_count}</span>}</button>;
}

/** Loads pages of messages, renders draft controls, and keeps the current conversation read. */
function ConversationView({ conversation }: { conversation: Conversation }): JSX.Element {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', conversation.id],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => assistantApi.getMessages(conversation.id, pageParam),
    getNextPageParam: (lastPage, allPages) => lastPage.length === 40 ? allPages.length * 40 : undefined,
  });
  useEffect(() => { void assistantApi.markConversationRead(conversation.id).then(() => void queryClient.invalidateQueries({ queryKey: ['conversations'] })); }, [conversation.id, queryClient]);
  const refresh = (): void => { void queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] }); };
  const approve = useMutation({ mutationFn: ({ id, content }: { id: string; content: string }) => assistantApi.approveDraft(id, content), onSuccess: refresh });
  const reject = useMutation({ mutationFn: (id: string) => assistantApi.rejectDraft(id), onSuccess: refresh });
  const regenerate = useMutation({ mutationFn: (id: string) => assistantApi.regenerateDraft(id), onSuccess: refresh });
  const pages = messagesQuery.data?.pages ?? [];
  const messages = pages.flat().slice().reverse();
  const name = conversation.contacts.display_name ?? `+${conversation.contacts.phone}`;
  return <article className="chat-panel"><header className="chat-header"><span className="avatar avatar--large">{initials(name)}</span><div><h2>{name}</h2><p><span className="presence-dot" /> {conversation.contacts.bot_mode === 'manual' ? 'Approval mode' : 'Assistant active'}</p></div><button className="icon-button" aria-label="Conversation options"><MoreHorizontal size={20} /></button></header><div className="messages"><button className="load-more" disabled={!messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage} onClick={() => void messagesQuery.fetchNextPage()}>{messagesQuery.hasNextPage ? <><ChevronUp size={15} /> Load earlier messages</> : 'Beginning of conversation'}</button>{messages.map((message) => <MessageBubble key={message.id} message={message} editing={editingId === message.id} draftText={draftText} onStartEdit={() => { setEditingId(message.id); setDraftText(message.content ?? ''); }} onChange={setDraftText} onCancel={() => setEditingId(null)} onApprove={() => { approve.mutate({ id: message.id, content: editingId === message.id ? draftText : message.content ?? '' }); setEditingId(null); }} onReject={() => reject.mutate(message.id)} onRegenerate={() => regenerate.mutate(message.id)} busy={approve.isPending || reject.isPending || regenerate.isPending} />)}</div></article>;
}

/** Displays one message, including assistant provider provenance and fully functional approval actions. */
function MessageBubble({ message, editing, draftText, onStartEdit, onChange, onCancel, onApprove, onReject, onRegenerate, busy }: { message: Message; editing: boolean; draftText: string; onStartEdit: () => void; onChange: (value: string) => void; onCancel: () => void; onApprove: () => void; onReject: () => void; onRegenerate: () => void; busy: boolean }): JSX.Element {
  const isIncoming = message.role === 'user';
  return <div className={isIncoming ? 'message-row message-row--incoming' : 'message-row message-row--outgoing'}><div className={isIncoming ? 'bubble bubble--incoming' : 'bubble bubble--outgoing'}>{editing ? <textarea value={draftText} onChange={(event) => onChange(event.target.value)} autoFocus /> : <p>{message.content}</p>}<div className="bubble-meta"><time>{formatTimestamp(message.created_at)}</time>{message.ai_provider && <span className="provider-tag">{message.ai_provider}</span>}{message.status !== 'sent' && <StatusPill status={message.status} />}</div></div>{message.status === 'draft' && <div className="draft-actions">{editing ? <><button className="button button--quiet" onClick={onCancel}><X size={15} /> Cancel</button><button className="button button--primary" disabled={busy} onClick={onApprove}><Send size={15} /> Approve</button></> : <><button className="button button--quiet" disabled={busy} onClick={onRegenerate}><RotateCw size={15} /> Rewrite</button><button className="button button--quiet" onClick={onStartEdit}><Pencil size={15} /> Edit</button><button className="button button--danger" disabled={busy} onClick={onReject}><X size={15} /> Reject</button><button className="button button--primary" disabled={busy} onClick={onApprove}><Check size={15} /> Approve</button></>}</div>}</div>;
}
