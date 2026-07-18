/** Determines whether the configured daily time window permits automatic activity. */
export function isWithinWorkingHours(start: string | null, end: string | null, now = new Date()): boolean {
  if (!start || !end) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (value: string): number => {
    const [hours = '0', minutesPart = '0'] = value.split(':');
    return Number(hours) * 60 + Number(minutesPart);
  };
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  return startMinutes <= endMinutes
    ? minutes >= startMinutes && minutes <= endMinutes
    : minutes >= startMinutes || minutes <= endMinutes;
}

/** Resolves the effective contact reply mode from global and per-contact settings. */
export function getEffectiveMode(
  contactMode: 'inherit' | 'auto' | 'manual' | 'off',
  defaultMode: 'auto' | 'manual',
): 'auto' | 'manual' | 'off' {
  return contactMode === 'inherit' ? defaultMode : contactMode;
}

