/** Displays an unobtrusive loading indicator while server data is being fetched. */
export function LoadingState(): JSX.Element {
  return <div className="loading-state"><span className="loading-orb" />Syncing your workspace…</div>;
}

