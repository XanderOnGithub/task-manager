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
