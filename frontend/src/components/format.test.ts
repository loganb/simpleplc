import { describe, expect, it } from 'vitest';
import { formatElapsedSeconds } from './format';

describe('formatElapsedSeconds', () => {
  it('shows whole seconds, with a readable duration past a minute', () => {
    expect(formatElapsedSeconds(null)).toBe('No data');
    expect(formatElapsedSeconds(0)).toBe('0 s');
    expect(formatElapsedSeconds(45.4)).toBe('45 s');
    expect(formatElapsedSeconds(754)).toBe('754 s (12m 34s)');
    expect(formatElapsedSeconds(3 * 3600 + 2 * 60 + 9)).toBe('10929 s (3h 02m)');
  });
});
