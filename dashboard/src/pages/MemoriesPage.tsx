import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Edit3, Plus, Save, Trash2 } from 'lucide-react';
import { assistantApi } from '../data/AssistantApi';
import { initials } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';

/** Offers a focused editorial surface for the durable facts the assistant remembers. */
export function MemoriesPage(): JSX.Element {
  const { data: conversations, isLoading } = useQuery({ queryKey: ['conversations'], queryFn: () => assistantApi.getConversations() });
  const [contactId, setContactId] = useState<string | null>(null);
  useEffect(() => { if (!contactId && conversations?.[0]) setContactId(conversations[0].contact_id); }, [contactId, conversations]);
  if (isLoading) return <LoadingState />;
  const selected = conversations?.find((conversation) => conversation.contact_id === contactId);
  return <section className="memory-layout"><header className="page-header"><div><p className="eyebrow">LONG-TERM MEMORY</p><h1>What Relay remembers.</h1><p className="subtle">Keep the details that make every reply feel personal.</p></div></header><div className="memory-workspace"><aside className="memory-people">{(conversations ?? []).map((conversation) => { const name = conversation.contacts.display_name ?? `+${conversation.contacts.phone}`; return <button key={conversation.contact_id} onClick={() => setContactId(conversation.contact_id)} className={contactId === conversation.contact_id ? 'memory-person memory-person--active' : 'memory-person'}><span className="avatar">{initials(name)}</span><span>{name}</span></button>; })}</aside><main className="memory-content">{selected ? <MemoryEditor contactId={selected.contact_id} name={selected.contacts.display_name ?? `+${selected.contacts.phone}`} /> : <EmptyState title="No contacts yet" detail="Facts appear after your first conversations." />}</main></div></section>;
}

/** Lets an operator add, edit, pin, and remove facts for the selected contact. */
function MemoryEditor({ contactId, name }: { contactId: string; name: string }): JSX.Element {
  const queryClient = useQueryClient();
  const [fact, setFact] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const { data: memories, isLoading } = useQuery({ queryKey: ['memories', contactId], queryFn: () => assistantApi.getMemories(contactId) });
  const refresh = (): void => { void queryClient.invalidateQueries({ queryKey: ['memories', contactId] }); };
  const create = useMutation({ mutationFn: (value: string) => assistantApi.createMemory(contactId, value), onSuccess: () => { setFact(''); refresh(); } });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: { fact?: string; is_pinned?: boolean } }) => assistantApi.updateMemory(id, values), onSuccess: () => { setEditId(null); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => assistantApi.deleteMemory(id), onSuccess: refresh });
  const submit = (event: FormEvent<HTMLFormElement>): void => { event.preventDefault(); if (fact.trim()) create.mutate(fact.trim()); };
  return <><div className="memory-title"><div><p className="eyebrow">CONTACT</p><h2>{name}</h2></div><span>{memories?.length ?? 0} facts</span></div><form className="memory-add" onSubmit={submit}><input value={fact} onChange={(event) => setFact(event.target.value)} placeholder="Add something worth remembering…" maxLength={500} /><button className="button button--primary" disabled={create.isPending}><Plus size={16} /> Add memory</button></form>{isLoading ? <LoadingState /> : <div className="memory-list">{memories?.map((memory) => <article className={memory.is_pinned ? 'memory-card memory-card--pinned' : 'memory-card'} key={memory.id}>{editId === memory.id ? <input autoFocus value={editValue} onChange={(event) => setEditValue(event.target.value)} /> : <p>{memory.fact}</p>}<div className="memory-card__footer"><button className={memory.is_pinned ? 'memory-pin memory-pin--active' : 'memory-pin'} onClick={() => update.mutate({ id: memory.id, values: { is_pinned: !memory.is_pinned } })}><Bookmark size={15} /> {memory.is_pinned ? 'Pinned' : 'Pin'}</button><span>{memory.category ?? 'other'}</span><div>{editId === memory.id ? <button className="icon-button" aria-label="Save memory" onClick={() => update.mutate({ id: memory.id, values: { fact: editValue.trim() } })}><Save size={16} /></button> : <button className="icon-button" aria-label="Edit memory" onClick={() => { setEditId(memory.id); setEditValue(memory.fact); }}><Edit3 size={16} /></button>}<button className="icon-button icon-button--danger" aria-label="Delete memory" onClick={() => remove.mutate(memory.id)}><Trash2 size={16} /></button></div></div></article>)}{!memories?.length && <EmptyState title="Nothing saved yet" detail="Add the little details that make answers genuinely useful." />}</div>}</>;
}
