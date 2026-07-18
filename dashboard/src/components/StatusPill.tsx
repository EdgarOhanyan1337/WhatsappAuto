import clsx from 'clsx';

/** Renders a compact status label with intentional semantic color. */
export function StatusPill({ status }: { status: string }): JSX.Element {
  const tone =
    status === 'connected' || status === 'sent' || status === 'success'
      ? 'success'
      : status === 'qr_pending' || status === 'draft'
        ? 'warning'
        : status === 'failed' || status === 'error' || status === 'disconnected'
          ? 'danger'
          : 'muted';
  return <span className={clsx('status-pill', `status-pill--${tone}`)}>{status.replace(/_/g, ' ')}</span>;
}

