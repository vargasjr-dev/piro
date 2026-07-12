interface FlameLogoProps {
  size?: number;
  className?: string;
}

/**
 * Piro mark: a warm gradient tile with a negative-space P.
 * The square aspect ratio keeps the mark consistent at every size.
 */
export default function FlameLogo({ size = 48, className = "" }: FlameLogoProps) {
  const uid = `piro-mark-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Piro"
    >
      <defs>
        <linearGradient
          id={`${uid}-gradient`}
          x1="16"
          y1="84"
          x2="84"
          y2="16"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="40%" stopColor="#dc2626" />
          <stop offset="72%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <mask id={`${uid}-mask`}>
          <rect width="100" height="100" fill="white" />
          {/* P cut out of the tile so the background shows through. */}
          <path
            d="M35 74V26h20c11 0 17 6 17 16s-6 16-17 16H45v16H35Zm10-39v14h9c5 0 8-2 8-7 0-4-3-7-8-7h-9Z"
            fill="black"
          />
        </mask>
      </defs>

      <rect
        x="9"
        y="9"
        width="82"
        height="82"
        rx="22"
        fill={`url(#${uid}-gradient)`}
        mask={`url(#${uid}-mask)`}
      />
    </svg>
  );
}
