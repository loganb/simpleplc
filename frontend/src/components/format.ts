export function formatComputedValue(value: number | boolean | null) {
  if (value === null) return 'No data';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

export function formatNullableBool(value: boolean | null) {
  if (value === null) return 'No data';
  return value ? 'true' : 'false';
}
