/** Capture viewfinder: four corners around a single point. Identical to public/favicon.svg. */
export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#101010" />
      <g transform="translate(4 4)">
        <path
          d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"
          fill="none"
          stroke="#f3f3f3"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="12" cy="12" r="2.8" fill="#c9b88a" />
      </g>
    </svg>
  )
}
