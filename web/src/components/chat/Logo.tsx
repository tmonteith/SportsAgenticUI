export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <g transform="rotate(-45 16 16)">
        <ellipse cx="16" cy="16" rx="14" ry="8.5" className="fill-highlight" />
        <path
          d="M10.5 16h11M13 14.250v3.500M16 14.250v3.500M19 14.250v3.500"
          className="stroke-background"
          strokeWidth="1.500"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
