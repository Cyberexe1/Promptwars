import type { ReactNode } from 'react';
export const AI_UNAVAILABLE =
  'AI suggestions are unavailable right now. Your plan is still shown.';
export function Loading({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <p className="state" role="status">
      {children}
    </p>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="state error" role="alert">
      <p>{message}</p>
      {retry && (
        <button type="button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function AiUnavailable() {
  return (
    <p className="banner" role="status">
      {AI_UNAVAILABLE}
    </p>
  );
}
