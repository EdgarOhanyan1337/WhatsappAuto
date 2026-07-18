import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { AppShell } from './components/AppShell';
import { supabase } from './lib/supabase';
import { ConversationsPage } from './pages/ConversationsPage';
import { LoginPage } from './pages/LoginPage';
import { MemoriesPage } from './pages/MemoriesPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { SettingsPage } from './pages/SettingsPage';
import { useUiStore } from './stores/uiStore';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } });

/** Mounts authenticated dashboard pages and invalidates live data when Supabase changes arrive. */
function Dashboard(): JSX.Element {
  const page = useUiStore((state) => state.page);
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => { void queryClient.invalidateQueries({ queryKey: ['messages'] }); void queryClient.invalidateQueries({ queryKey: ['conversations'] }); void queryClient.invalidateQueries({ queryKey: ['overview'] }); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_sessions' }, () => { void queryClient.invalidateQueries({ queryKey: ['overview'] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);
  const content = page === 'overview' ? <OverviewPage /> : page === 'conversations' ? <ConversationsPage /> : page === 'memories' ? <MemoriesPage /> : page === 'providers' ? <ProvidersPage /> : <SettingsPage />;
  return <AppShell>{content}</AppShell>;
}

/** Resolves Supabase session state before rendering the private assistant workspace. */
export default function App(): JSX.Element {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="app-loading"><span className="loading-orb" /></div>;
  return <QueryClientProvider client={queryClient}>{session ? <Dashboard /> : <LoginPage />}</QueryClientProvider>;
}

