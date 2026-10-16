// The Moss mark: a lowercase m made of two moss mounds, a leaf, and the soil
// line it grows from. Same drawing as brand/icon.svg, flat and in theme colors
// so it works at sidebar size in light and dark.

export function MossMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="220 330 590 400" className={className} aria-hidden="true">
      <path
        d="M 294 682 V 494 A 109 109 0 0 1 512 494 V 682 M 512 494 A 109 109 0 0 1 730 494 V 682"
        fill="none"
        stroke="var(--color-brand-moss)"
        strokeWidth="92"
        strokeLinejoin="round"
      />
      <path
        transform="translate(722 392) rotate(-42)"
        d="M -6 0 C 30 -46 92 -62 148 -50 C 122 4 58 28 -6 0 Z"
        fill="var(--color-brand-leaf)"
      />
      <rect x="232" y="666" width="560" height="52" rx="26" fill="var(--color-brand-earth)" />
    </svg>
  )
}

/**
 * The full wordmark, "moss°": the mark's m, then o, s, s drawn with the same
 * round stroke, the leaf, a small ring for the degree sign, all on the soil
 * line. Same drawing as brand/wordmark-*.svg (made by brand/wordmark.py), flat
 * and in theme colors.
 */
export function MossWordmark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="-41.3 39.9 714 213.8" className={className} role="img" aria-label="Moss">
      <g fill="none" stroke="var(--color-brand-moss)" strokeWidth="40">
        <path
          strokeLinejoin="round"
          d="M 0 230 V 148.3 A 47.4 47.4 0 0 1 94.8 148.3 V 230 M 94.8 148.3 A 47.4 47.4 0 0 1 189.6 148.3 V 230 M 247.6 155.4 A 54.6 54.6 0 1 1 356.7 155.4 A 54.6 54.6 0 1 1 247.6 155.4 Z"
        />
        <path
          strokeLinecap="round"
          d="M 472 113.7 A 31 27.3 0 1 0 445.7 155.4 A 31 27.3 0 1 1 419.4 197.2 M 592 113.7 A 31 27.3 0 1 0 565.7 155.4 A 31 27.3 0 1 1 539.4 197.2"
        />
      </g>
      <path
        transform="translate(186.1 103.9) rotate(-42) scale(0.4348)"
        d="M -6 0 C 30 -46 92 -62 148 -50 C 122 4 58 28 -6 0 Z"
        fill="var(--color-brand-leaf)"
      />
      <circle cx="643.7" cy="84.9" r="15" fill="none" stroke="var(--color-brand-leaf)" strokeWidth="12" />
      <rect x="-35.3" y="223" width="660" height="22.6" rx="11.3" fill="var(--color-brand-earth)" />
    </svg>
  )
}
