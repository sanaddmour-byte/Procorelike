interface Props {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** A consistent error box: what happened, and a way to recover -- never just a red line of text with no next step. */
export function ErrorState({ message, onRetry, retryLabel = "Retry" }: Props) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded border border-red-400 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
          {retryLabel}
        </button>
      )}
    </div>
  );
}
