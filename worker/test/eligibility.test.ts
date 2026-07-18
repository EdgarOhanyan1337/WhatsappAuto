import { describe, expect, it } from 'vitest';
import { getEffectiveMode, isWithinWorkingHours } from '../src/whatsapp/eligibility.js';

/** Covers contact overrides and working-hour boundaries before messages reach any provider. */
describe('reply eligibility', () => {
  it('lets a contact override the global mode', () => {
    expect(getEffectiveMode('inherit', 'manual')).toBe('manual');
    expect(getEffectiveMode('auto', 'manual')).toBe('auto');
    expect(getEffectiveMode('off', 'auto')).toBe('off');
  });

  it('supports a working-hours window that spans midnight', () => {
    expect(isWithinWorkingHours('22:00:00', '06:00:00', new Date('2026-01-01T23:30:00'))).toBe(true);
    expect(isWithinWorkingHours('22:00:00', '06:00:00', new Date('2026-01-01T12:30:00'))).toBe(false);
  });
});

