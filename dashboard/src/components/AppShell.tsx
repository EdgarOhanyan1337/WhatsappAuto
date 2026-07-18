import { Bot, BrainCircuit, MessageCircle, PanelLeft, Settings2, Sparkles } from 'lucide-react';
import type { Page } from '../types';
import { useUiStore } from '../stores/uiStore';

const navigation: Array<{ page: Page; label: string; icon: typeof PanelLeft }> = [
  { page: 'overview', label: 'Overview', icon: PanelLeft },
  { page: 'conversations', label: 'Conversations', icon: MessageCircle },
  { page: 'memories', label: 'Memory', icon: BrainCircuit },
  { page: 'providers', label: 'Providers', icon: Sparkles },
  { page: 'settings', label: 'Settings', icon: Settings2 },
];

/** Provides the low-chrome premium navigation surrounding every authenticated page. */
export function AppShell({ children }: { children: React.ReactNode }): JSX.Element {
  const { page, setPage } = useUiStore();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Bot size={19} /></span><span>relay</span></div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.page} className={page === item.page ? 'nav-item nav-item--active' : 'nav-item'} onClick={() => setPage(item.page)}>
                <Icon size={18} /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer"><span className="presence-dot" />Private workspace</div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
