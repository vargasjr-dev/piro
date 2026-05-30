interface FlameLogoProps {
  size?: number;
  showP?: boolean;
  className?: string;
}

export default function FlameLogo({ size = 48, showP = true, className = "" }: FlameLogoProps) {
  const id = `fl-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={`${id}-outer`} x1="32" y1="60" x2="32" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="45%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="32" y1="56" x2="32" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer flame body */}
      <path
        d="M32 4
          C28 12 18 16 16 26
          C14 34 18 38 16 44
          C13 50 18 60 32 60
          C46 60 51 50 48 44
          C46 38 50 34 48 26
          C46 16 36 12 32 4Z"
        fill={`url(#${id}-outer)`}
        filter={`url(#${id}-glow)`}
      />

      {/* Left lick — slightly darker asymmetry */}
      <path
        d="M22 32
          C20 38 22 44 18 48
          C16 52 20 60 32 60
          C22 56 20 50 22 44
          C24 38 22 34 22 32Z"
        fill="#c2410c"
        opacity="0.45"
      />

      {/* Inner core glow */}
      <path
        d="M32 28
          C30 32 26 36 26 42
          C26 50 29 56 32 56
          C35 56 38 50 38 42
          C38 36 34 32 32 28Z"
        fill={`url(#${id}-inner)`}
        opacity="0.8"
      />

      {/* P letterform */}
      {showP && (
        <text
          x="32"
          y="49"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="900"
          fontSize="20"
          fill="white"
          opacity="0.9"
        >
          P
        </text>
      )}
    </svg>
  );
}
