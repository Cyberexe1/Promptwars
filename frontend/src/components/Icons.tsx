import type { ReactNode } from 'react';

export type IconName =
  | 'overview'
  | 'budget'
  | 'timeline'
  | 'vendors'
  | 'ideas'
  | 'assistant'
  | 'calendar'
  | 'check'
  | 'wallet'
  | 'sparkle'
  | 'warning'
  | 'pin'
  | 'users'
  | 'heart'
  | 'cake'
  | 'community'
  | 'arrow';

const paths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  budget: (
    <>
      <path d="M12 3v18" />
      <path d="M16.5 7.5c-.8-1.2-2.4-2-4.5-2-2.6 0-4.5 1.3-4.5 3.2 0 4.3 9 2 9 6.3 0 1.9-2 3.2-4.5 3.2-2.2 0-3.9-.9-4.8-2.2" />
    </>
  ),
  timeline: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M6 8.5v7" />
      <path d="M12 6h9" />
      <path d="M12 18h9" />
    </>
  ),
  vendors: (
    <>
      <path d="M3 9.5 4.5 4h15L21 9.5" />
      <path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 12.5V20h14v-7.5" />
    </>
  ),
  ideas: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />
    </>
  ),
  assistant: (
    <>
      <path d="M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z" />
      <path d="M9 11h6" />
      <path d="M9 14.5h3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16.3 9.5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
      <path d="M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5Z" />
      <circle cx="16.5" cy="13.5" r="1" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2.5 19.5h19L12 3Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.2v.1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.7a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18 14.2A6.5 6.5 0 0 1 21.5 20" />
    </>
  ),
  heart: (
    <path d="M12 20.5S3.5 15 3.5 8.9A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 8.5 1.8C20.5 15 12 20.5 12 20.5Z" />
  ),
  cake: (
    <>
      <path d="M4 20h16v-6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2V20Z" />
      <path d="M4 16c2 1.5 3 1.5 4 0s2-1.5 4 0 3 1.5 4 0 2-1.5 4 0" />
      <path d="M12 11.5V8" />
      <path d="M12 5.2c.9.9.9 1.9 0 2.8-.9-.9-.9-1.9 0-2.8Z" />
    </>
  ),
  community: (
    <>
      <circle cx="12" cy="6.5" r="2.5" />
      <circle cx="5.5" cy="16.5" r="2.5" />
      <circle cx="18.5" cy="16.5" r="2.5" />
      <path d="M10.5 8.7 6.8 14.3" />
      <path d="m13.5 8.7 3.7 5.6" />
      <path d="M8 16.5h8" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
};

/** Decorative inline icon. Always hidden from assistive technology. */
export function Icon({
  name,
  className = '',
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

/** Icon for an event type; falls back to the sparkle icon. */
export function eventTypeIcon(type: string): IconName {
  if (type === 'wedding') return 'heart';
  if (type === 'birthday') return 'cake';
  if (type === 'community') return 'community';
  return 'sparkle';
}
