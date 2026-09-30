export function formatComputedValue(value: number | boolean | null) {
  if (value === null) return 'No data';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

export function formatElapsedSeconds(seconds: number | null) {
  if (seconds === null) return 'No data';
  const whole = Math.floor(seconds);
  if (whole < 60) return `${whole} s`;

  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const readable = hours > 0 ? `${hours}h ${pad(minutes)}m` : `${minutes}m ${pad(whole % 60)}s`;
  return `${whole} s (${readable})`;
}

export function formatNullableBool(value: boolean | null) {
  if (value === null) return 'No data';
  return value ? 'true' : 'false';
}
