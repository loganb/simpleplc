export function FormButtons({ saving, disabled, onSave, onCancel }: {
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <button
        class="rounded bg-active px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        onClick={onSave}
        disabled={saving || disabled}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        class="rounded border border-border px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text"
        onClick={onCancel}
      >
        Cancel
      </button>
    </>
  );
}
