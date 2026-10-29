const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Decorative circular progress indicator. The same information is always
 * available as text next to it, so the graphic is hidden from assistive tech.
 */
export function ProgressRing({ percent }: { percent: number }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <svg
      className="progress-ring"
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="progress-ring__track" cx="60" cy="60" r={RADIUS} />
      <circle
        className="progress-ring__value"
        cx="60"
        cy="60"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - value / 100)}
        transform="rotate(-90 60 60)"
      />
      <text
        className="progress-ring__label"
        x="60"
        y="60"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {value}%
      </text>
    </svg>
  );
}
