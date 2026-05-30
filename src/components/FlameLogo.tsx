interface FlameLogoProps {
  size?: number;
  className?: string;
}

export default function FlameLogo({ size = 48, className = "" }: FlameLogoProps) {
  // Unique ID per size to avoid SVG gradient collisions when multiple logos are on the same page
  const uid = `fl${size}`;
  return (
    <svg
      width={size}
      height={Math.round(size * 1.1)}
      viewBox="0 0 100 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-outer`} x1="50" y1="100" x2="50" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7f1d1d" />
          <stop offset="35%"  stopColor="#c2410c" />
          <stop offset="70%"  stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-inner`} x1="50" y1="96" x2="50" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fef08a" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer flame — wide base, two organic side bulges, sharp tip */}
      <path
        d="M50 8
           C42 16, 22 24, 18 44
           C14 58, 18 66, 14 76
           C10 88, 22 102, 50 102
           C78 102, 90 88, 86 76
           C82 66, 86 58, 82 44
           C78 24, 58 16, 50 8Z"
        fill={`url(#${uid}-outer)`}
        filter={`url(#${uid}-glow)`}
      />

      {/* Inner hot-core glow — the "container" that wraps the P */}
      <path
        d="M50 46
           C42 54, 36 62, 38 72
           C40 82, 46 92, 50 92
           C54 92, 60 82, 62 72
           C64 62, 58 54, 50 46Z"
        fill={`url(#${uid}-inner)`}
        opacity="0.8"
      />

      {/* P — sits squarely inside the inner glow */}
      <text
        x="50"
        y="90"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="26"
        fill="white"
        opacity="0.95"
      >
        P
      </text>
    </svg>
  );
}
