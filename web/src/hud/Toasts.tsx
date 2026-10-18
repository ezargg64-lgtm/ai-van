import { useHud } from '../state/hudStore';

export function Toasts() {
  const toasts = useHud((s) => s.toasts);
  const dismiss = useHud((s) => s.dismissToast);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <button key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}
