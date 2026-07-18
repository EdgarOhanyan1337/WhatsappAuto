import { Inbox } from 'lucide-react';

/** Displays a calm empty state that makes the next step obvious. */
export function EmptyState({ title, detail }: { title: string; detail: string }): JSX.Element {
  return <div className="empty-state"><Inbox size={25} /><h3>{title}</h3><p>{detail}</p></div>;
}

