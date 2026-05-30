interface FlameLogoProps {
  size?: number;
  className?: string;
}

export default function FlameLogo({ size = 48, className = "" }: FlameLogoProps) {
  const uid = `fl${size}`;
  // Maintain the 100:110 aspect ratio so the shape never clips
  const h = Math.round(size * 1.1);

  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 100 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Outer flame — dark red base → fire orange → amber tip */}
        <linearGradient id={`${uid}-out`} x1="50" y1="108" x2="50" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7f1d1d" />
          <stop offset="30%"  stopColor="#b91c1c" />
          <stop offset="58%"  stopColor="#ea580c" />
          <stop offset="82%"  stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        {/* Inner hot core — brighter */}
        <linearGradient id={`${uid}-in`} x1="50" y1="104" x2="50" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#c2410c" />
          <stop offset="55%"  stopColor="#fb923c" />
          <stop offset="100%" stopColor="#fef9c3" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-25%" y="-20%" width="150%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/*
        OUTER FLAME
        Wide fire shape — NOT a teardrop/candle.
        Key traits:
          • Tip offset slightly left (46, 6) — asymmetric like real fire
          • Left side bows dramatically outward at y≈56 (x≈8)
          • Right side bows out at y≈50 (x≈90) — slightly higher so shape leans left
          • Wide rounded base (x=14..86 at y=106)
          • Sharp concave dip on right side near tip creates a "lick" shape
      */}
      <path
        d="M46 6
           C36 16, 10 28, 8 52
           C6 66, 10 76, 8 88
           C6 100, 22 110, 50 110
           C78 110, 94 100, 92 88
           C90 76, 94 66, 92 52
           C90 28, 72 14, 66 22
           C62 28, 56 36, 50 28
           C48 20, 48 12, 46 6Z"
        fill={`url(#${uid}-out)`}
        filter={`url(#${uid}-glow)`}
      />

      {/*
        INNER HOT CORE
        Sits in the belly of the flame — where the P lives.
        Teardrop pointing upward, covering roughly y=44 to y=100.
      */}
      <path
        d="M50 44
           C42 54, 34 64, 36 76
           C38 88, 44 100, 50 100
           C56 100, 62 88, 64 76
           C66 64, 58 54, 50 44Z"
        fill={`url(#${uid}-in)`}
        opacity="0.82"
      />

      {/* P — centered in the hot core */}
      <text
        x="50"
        y="96"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="28"
        fill="white"
        opacity="0.95"
      >
        P
      </text>
    </svg>
  );
}
