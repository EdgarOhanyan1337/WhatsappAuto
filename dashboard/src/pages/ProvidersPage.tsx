import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Play, Signal, TriangleAlert } from 'lucide-react';
import { assistantApi } from '../data/AssistantApi';
import { formatTimestamp } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { StatusPill } from '../components/StatusPill';

type Provider = { id: string; name: string; priority: number; enabled: boolean; cooldown_until: string | null };

/** Lets an operator prioritize, enable, and diagnose the resilient provider chain. */
export function ProvidersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { data: providers, isLoading } = useQuery({ queryKey: ['providers'], queryFn: () => assistantApi.getProviders() });
  const { data: logs } = useQuery({ queryKey: ['provider-logs'], queryFn: () => assistantApi.getProviderLogs() });
  const [testing, setTesting] = useState<string | null>(null);
  const refresh = (): void => { void queryClient.invalidateQueries({ queryKey: ['providers'] }); void queryClient.invalidateQueries({ queryKey: ['provider-logs'] }); };
  const reorder = useMutation({ mutationFn: (items: Provider[]) => assistantApi.reorderProviders(items.map((item, index) => ({ id: item.id, priority: index + 1 }))), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => assistantApi.setProviderEnabled(id, enabled), onSuccess: refresh });
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (event: DragEndEvent): void => { if (!providers || !event.over || event.active.id === event.over.id) return; const from = providers.findIndex((item) => item.id === event.active.id); const to = providers.findIndex((item) => item.id === event.over?.id); reorder.mutate(arrayMove(providers, from, to)); };
  const test = async (name: string): Promise<void> => { setTesting(name); try { await assistantApi.testProvider(name); refresh(); } finally { setTesting(null); } };
  if (isLoading) return <LoadingState />;
  return <section className="page-section"><header className="page-header"><div><p className="eyebrow">AI ROUTING</p><h1>Always have a way through.</h1><p className="subtle">Drag to set the order Relay uses when a provider is unavailable.</p></div><div className="provider-health"><Signal size={17} />Failover active</div></header><div className="providers-layout"><div className="provider-list"><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}><SortableContext items={(providers ?? []).map((provider) => provider.id)} strategy={verticalListSortingStrategy}>{providers?.map((provider) => <ProviderRow key={provider.id} provider={provider} testing={testing === provider.name} onTest={() => void test(provider.name)} onToggle={() => toggle.mutate({ id: provider.id, enabled: !provider.enabled })} />)}</SortableContext></DndContext>{!providers?.length && <EmptyState title="No provider keys found" detail="Add at least one provider key to the worker environment, then restart it." />}</div><aside className="logs-panel"><div className="logs-panel__header"><h2>Recent activity</h2><span>Live logs</span></div>{logs?.map((log) => <div className="log-row" key={log.id}><span className={log.success ? 'log-dot log-dot--ok' : 'log-dot log-dot--bad'} /><div><strong>{log.provider}</strong><p>{log.success ? `${log.latency_ms ?? '—'} ms response` : log.error_message ?? 'Failed'}</p></div><time>{formatTimestamp(log.created_at)}</time></div>)}{!logs?.length && <div className="logs-empty"><TriangleAlert size={18} />Provider calls will be recorded here.</div>}</aside></div></section>;
}

/** Provides one keyboard-accessible sortable row for an AI provider. */
function ProviderRow({ provider, testing, onTest, onToggle }: { provider: Provider; testing: boolean; onTest: () => void; onToggle: () => void }): JSX.Element {
  const sortable = useSortable({ id: provider.id });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return <article ref={sortable.setNodeRef} style={style} className={provider.enabled ? 'provider-card' : 'provider-card provider-card--disabled'}><button className="drag-handle" aria-label={`Move ${provider.name}`} {...sortable.attributes} {...sortable.listeners}><GripVertical size={18} /></button><span className="provider-order">{provider.priority}</span><div className="provider-name"><strong>{provider.name}</strong>{provider.cooldown_until && new Date(provider.cooldown_until) > new Date() ? <StatusPill status="cooldown" /> : <span>{provider.enabled ? 'Ready' : 'Paused'}</span>}</div><button className="button button--quiet" disabled={!provider.enabled || testing} onClick={onTest}><Play size={14} />{testing ? 'Testing…' : 'Test'}</button><button className={provider.enabled ? 'mini-switch mini-switch--on' : 'mini-switch'} onClick={onToggle} aria-label={`Toggle ${provider.name}`}><span /></button></article>;
}
