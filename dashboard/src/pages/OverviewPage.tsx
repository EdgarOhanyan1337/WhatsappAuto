import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Bot, MessageSquareText, QrCode, Sparkles } from 'lucide-react';
import { assistantApi } from '../data/AssistantApi';
import { formatTimestamp } from '../lib/format';
import { LoadingState } from '../components/LoadingState';
import { StatusPill } from '../components/StatusPill';

/** Shows the assistant's state, connection path, and only the metrics that matter today. */
export function OverviewPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['overview'], queryFn: () => assistantApi.getOverview() });
  if (isLoading) return <LoadingState />;
  if (error || !data) return <div className="error-state">Couldn’t load your workspace. Refresh and try again.</div>;
  const connected = data.session?.status === 'connected';
  const toggle = async (): Promise<void> => {
    await assistantApi.toggleBot(!data.settings?.bot_enabled);
    await queryClient.invalidateQueries({ queryKey: ['overview'] });
    await queryClient.invalidateQueries({ queryKey: ['settings'] });
  };
  return <section className="page-section">
    <header className="page-header"><div><p className="eyebrow">COMMAND CENTER</p><h1>Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}.</h1><p className="subtle">Your replies are handled with intention.</p></div><button className={data.settings?.bot_enabled ? 'power-toggle power-toggle--on' : 'power-toggle'} onClick={() => void toggle()}><span />{data.settings?.bot_enabled ? 'Assistant on' : 'Assistant off'}</button></header>
    <div className="hero-status">
      <div className="hero-status__icon"><Activity size={23} /></div>
      <div><p className="eyebrow">WHATSAPP CONNECTION</p><div className="status-line"><h2>{connected ? 'Connected and listening' : data.session?.status === 'qr_pending' ? 'Ready to link your phone' : 'Waiting for a connection'}</h2><StatusPill status={data.session?.status ?? 'disconnected'} /></div><p>{connected ? `Last linked ${formatTimestamp(data.session?.last_connected_at)}. Incoming messages will follow your active rules.` : 'Link WhatsApp once to start quietly handling messages.'}</p></div>
      {data.session?.qr_code && <img className="qr-preview" src={data.session.qr_code} alt="WhatsApp linking QR code" />}
      {!connected && !data.session?.qr_code && <div className="hero-status__aside"><QrCode size={18} />QR will appear here</div>}
    </div>
    <div className="metric-grid">
      <article className="metric-card"><span className="metric-icon"><MessageSquareText size={19} /></span><p>Messages today</p><strong>{data.todayCount}</strong><small>Across every active conversation</small></article>
      <article className="metric-card"><span className="metric-icon metric-icon--violet"><Sparkles size={19} /></span><p>Latest responder</p><strong className="metric-word">{data.latestProvider ?? '—'}</strong><small>Provider routing is live</small></article>
      <article className="metric-card"><span className="metric-icon metric-icon--green"><Bot size={19} /></span><p>Reply workflow</p><strong className="metric-word">{data.settings?.default_mode ?? 'auto'}</strong><small>Default for new contacts</small></article>
    </div>
  </section>;
}

