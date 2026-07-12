import Link from "next/link";

/* ──────────────────────────────────────────────────────────────────────
   10 logo options — 5 that refine the current flame+P aesthetic,
   5 completely new directions.  Each is a self-contained SVG component
   so we can drop the winner straight into FlameLogo.tsx.
   ──────────────────────────────────────────────────────────────────── */

interface LogoProps { size?: number; className?: string }

/* ════════ GROUP A — Refine the flame + P aesthetic ════════ */

/* A1: Cleaner flame — smoother curves, P vertically centered in core */
function A1({ size = 72 }: LogoProps) {
  const uid = "a1";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="95" x2="50" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="25%" stopColor="#b91c1c" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="75%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-c`} x1="50" y1="90" x2="50" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c2410c" />
          <stop offset="60%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#fef9c3" />
        </linearGradient>
      </defs>
      {/* Outer flame — smooth, symmetric, less wobbly */}
      <path
        d="M50 5
           C40 15, 22 25, 18 45
           C14 62, 20 72, 16 82
           C14 92, 28 98, 50 98
           C72 98, 86 92, 84 82
           C80 72, 86 62, 82 45
           C78 25, 60 15, 50 5Z"
        fill={`url(#${uid}-g)`}
      />
      {/* Inner core — centered, teardrop */}
      <path
        d="M50 30
           C42 40, 36 50, 38 62
           C40 74, 45 86, 50 86
           C55 86, 60 74, 62 62
           C64 50, 58 40, 50 30Z"
        fill={`url(#${uid}-c)`}
        opacity="0.85"
      />
      {/* P — centered in the core (y=68 is middle of 30-86) */}
      <text x="50" y="72" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="30" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* A2: Negative-space P — flame shape with P cut out */
function A2({ size = 72 }: LogoProps) {
  const uid = "a2";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="95" x2="50" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="30%" stopColor="#dc2626" />
          <stop offset="60%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <mask id={`${uid}-m`}>
          <rect width="100" height="100" fill="white" />
          {/* P shape cut out — bold, centered */}
          <path
            d="M38 35 L38 72 L44 72 L44 58 L56 58 C62 58, 66 54, 66 47 C66 40, 62 35, 56 35 L38 35Z M44 41 L56 41 C59 41, 60 43, 60 47 C60 51, 59 52, 56 52 L44 52 L44 41Z"
            fill="black"
          />
        </mask>
      </defs>
      {/* Flame shape with P punched out */}
      <path
        d="M50 5
           C42 18, 25 28, 20 48
           C16 64, 22 74, 18 84
           C16 93, 30 98, 50 98
           C70 98, 84 93, 82 84
           C78 74, 84 64, 80 48
           C75 28, 58 18, 50 5Z"
        fill={`url(#${uid}-g)`}
        mask={`url(#${uid}-m)`}
      />
    </svg>
  );
}

/* A3: Rounded soft flame with subtle glow and centered P */
function A3({ size = 72 }: LogoProps) {
  const uid = "a3";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="92" x2="50" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#991b1b" />
          <stop offset="35%" stopColor="#dc2626" />
          <stop offset="65%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fcd34d" />
        </linearGradient>
        <radialGradient id={`${uid}-c`} cx="50" cy="62" r="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="50%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </radialGradient>
        <filter id={`${uid}-b`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Outer flame — very rounded, blob-like */}
      <path
        d="M50 8
           C44 20, 30 32, 24 48
           C20 60, 24 70, 22 80
           C20 90, 32 96, 50 96
           C68 96, 80 90, 78 80
           C76 70, 80 60, 76 48
           C70 32, 56 20, 50 8Z"
        fill={`url(#${uid}-g)`}
        filter={`url(#${uid}-b)`}
      />
      {/* Inner glow core — circular, soft */}
      <ellipse cx="50" cy="60" rx="20" ry="26" fill={`url(#${uid}-c)`} opacity="0.75" />
      {/* P — centered at y=60 (middle of core) */}
      <text x="50" y="70" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="28" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* A4: Sharp angular flame, geometric, with P */
function A4({ size = 72 }: LogoProps) {
  const uid = "a4";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="95" x2="50" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="40%" stopColor="#dc2626" />
          <stop offset="70%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      {/* Sharp angular flame — straight lines, crystalline */}
      <path
        d="M52 5 L38 28 L22 40 L28 55 L18 65 L26 78 L16 88 L30 96 L50 98 L70 96 L84 88 L74 78 L82 65 L72 55 L78 40 L62 28 L48 5Z"
        fill={`url(#${uid}-g)`}
      />
      {/* Inner cutout — darker flame shape */}
      <path
        d="M50 30 L42 42 L36 50 L40 58 L34 64 L40 72 L36 80 L44 86 L50 88 L56 86 L64 80 L60 72 L66 64 L60 58 L64 50 L58 42 L50 30Z"
        fill="#1a0a05"
        opacity="0.6"
      />
      {/* P — centered */}
      <text x="50" y="68" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="26" fill="#fde68a" opacity="0.95">P</text>
    </svg>
  );
}

/* A5: Double flame — outer outline + inner fill, P in center */
function A5({ size = 72 }: LogoProps) {
  const uid = "a5";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="95" x2="50" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="35%" stopColor="#dc2626" />
          <stop offset="65%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="50" y1="88" x2="50" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="50%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fef9c3" />
        </linearGradient>
      </defs>
      {/* Outer flame outline (thick stroke) */}
      <path
        d="M50 6
           C43 18, 26 28, 21 46
           C17 60, 23 70, 19 80
           C17 90, 30 96, 50 96
           C70 96, 83 90, 81 80
           C77 70, 83 60, 79 46
           C74 28, 57 18, 50 6Z"
        fill="none"
        stroke={`url(#${uid}-g)`}
        strokeWidth="3.5"
      />
      {/* Inner solid flame — slightly smaller */}
      <path
        d="M50 22
           C44 32, 32 40, 29 52
           C26 62, 31 70, 28 78
           C27 86, 36 90, 50 90
           C64 90, 73 86, 72 78
           C69 70, 74 62, 71 52
           C68 40, 56 32, 50 22Z"
        fill={`url(#${uid}-i)`}
      />
      {/* P — centered */}
      <text x="50" y="66" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="26" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* ════════ GROUP C — Chaotic A5 explorations ════════ */

/* C1: Licked outline — asymmetric outer contour with a calm inner flame */
function C1({ size = 72 }: LogoProps) {
  const uid = "c1";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="96" x2="46" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="30%" stopColor="#dc2626" />
          <stop offset="62%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="52" y1="91" x2="45" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#991b1b" />
          <stop offset="55%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#fef9c3" />
        </linearGradient>
      </defs>
      {/* Uneven outer contour: left lick, right hook, offset tip */}
      <path d="M45 5 C43 16 29 21 24 34 C19 46 24 48 17 57 C11 65 19 69 15 79 C12 88 27 97 49 97 C74 97 89 90 82 79 C78 72 91 69 84 59 C80 53 88 44 78 34 C71 27 62 21 61 10 C59 17 54 23 49 28 C48 19 49 11 45 5Z" fill="none" stroke={`url(#${uid}-g)`} strokeWidth="3.6" strokeLinejoin="round" />
      <path d="M52 24 C45 36 35 40 35 51 C35 58 28 63 32 73 C35 84 43 90 52 90 C61 90 70 84 68 75 C66 68 73 62 67 53 C63 46 56 40 52 24Z" fill={`url(#${uid}-i)`} />
      <text x="51" y="70" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="27" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* C2: Three-tongue flame — visible side licks around the A5 double flame */
function C2({ size = 72 }: LogoProps) {
  const uid = "c2";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="97" x2="50" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="38%" stopColor="#dc2626" /><stop offset="70%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="50" y1="91" x2="50" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#b91c1c" /><stop offset="55%" stopColor="#fb923c" /><stop offset="100%" stopColor="#fef9c3" />
        </linearGradient>
      </defs>
      {/* Outer flame with three unpredictable tongues */}
      <path d="M48 5 C46 16 40 22 35 29 C32 23 27 20 25 25 C22 31 28 37 24 43 C20 49 13 50 15 58 C17 64 24 65 20 73 C15 82 25 96 49 97 C73 98 87 89 80 78 C76 71 85 67 84 60 C83 53 76 50 77 43 C78 37 84 31 79 26 C75 22 70 28 67 34 C63 26 57 18 55 9 C53 16 50 21 48 26 C47 17 50 10 48 5Z" fill="none" stroke={`url(#${uid}-g)`} strokeWidth="3.4" strokeLinejoin="round" />
      <path d="M51 25 C45 36 35 43 36 53 C37 61 31 66 34 76 C37 86 44 91 51 91 C60 91 67 85 66 77 C64 69 71 64 66 54 C62 45 55 37 51 25Z" fill={`url(#${uid}-i)`} />
      <text x="51" y="71" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="27" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* C3: Leaning fire — the whole flame bends left like a real flame in wind */
function C3({ size = 72 }: LogoProps) {
  const uid = "c3";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="53" y1="96" x2="35" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="35%" stopColor="#dc2626" /><stop offset="68%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="55" y1="90" x2="39" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#991b1b" /><stop offset="50%" stopColor="#fb923c" /><stop offset="100%" stopColor="#fef9c3" />
        </linearGradient>
      </defs>
      {/* Windblown silhouette — offset lobes and a hooked tip */}
      <path d="M56 4 C48 16 32 20 27 33 C24 41 31 45 23 51 C16 56 18 63 27 66 C18 72 14 80 22 87 C31 96 47 98 62 96 C81 94 88 84 79 77 C73 72 84 66 77 59 C72 54 80 47 72 39 C67 34 59 31 58 24 C57 17 62 10 56 4Z" fill="none" stroke={`url(#${uid}-g)`} strokeWidth="3.6" strokeLinejoin="round" />
      <path d="M52 25 C44 35 34 41 36 51 C38 58 31 64 36 73 C40 83 48 89 57 89 C65 89 71 84 68 76 C65 68 73 62 66 52 C62 45 55 37 52 25Z" fill={`url(#${uid}-i)`} />
      <text x="54" y="70" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="27" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* C4: Scratched ember — irregular hand-drawn double outline with a brighter core */
function C4({ size = 72 }: LogoProps) {
  const uid = "c4";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="97" x2="48" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="32%" stopColor="#dc2626" /><stop offset="65%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <radialGradient id={`${uid}-i`} cx="50" cy="58" r="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef9c3" /><stop offset="48%" stopColor="#fb923c" /><stop offset="100%" stopColor="#b91c1c" />
        </radialGradient>
      </defs>
      {/* Two slightly mismatched strokes create a hand-drawn, chaotic edge */}
      <path d="M49 6 C42 17 28 26 22 41 C18 52 25 56 18 64 C12 72 20 75 17 83 C14 92 31 98 50 97 C70 97 88 91 81 81 C77 74 87 69 80 60 C75 53 83 45 76 35 C69 26 58 20 55 8 C53 15 51 21 47 27 C47 18 51 11 49 6Z" fill="none" stroke={`url(#${uid}-g)`} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 8 C39 20 26 28 21 42 C17 53 24 57 17 65 C11 73 19 76 16 84 C13 93 30 99 49 98 C69 98 87 92 80 82 C76 75 86 70 79 61 C74 54 82 46 75 36 C68 27 57 21 54 10" fill="none" stroke="#fb923c" strokeWidth="0.9" strokeLinecap="round" opacity="0.8" />
      <path d="M50 28 C43 38 34 45 36 55 C38 62 31 68 35 77 C39 87 46 91 53 90 C62 89 68 83 65 75 C62 67 69 61 64 52 C60 44 54 36 50 28Z" fill={`url(#${uid}-i)`} />
      <text x="51" y="71" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="27" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* C5: Emoji flame — fullest silhouette, big side lobes, hot yellow inner tongue */
function C5({ size = 72 }: LogoProps) {
  const uid = "c5";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="98" x2="50" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="25%" stopColor="#dc2626" /><stop offset="55%" stopColor="#f97316" /><stop offset="82%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#fef3c7" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="50" y1="92" x2="50" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c2410c" /><stop offset="45%" stopColor="#fb923c" /><stop offset="100%" stopColor="#fff7ed" />
        </linearGradient>
      </defs>
      {/* Big emoji-like silhouette with multiple tongues and a rounded base */}
      <path d="M47 3 C46 17 35 22 30 34 C26 43 33 47 25 53 C17 59 11 65 18 72 C23 77 17 83 21 89 C27 98 41 99 50 98 C62 99 78 96 82 87 C85 80 77 77 84 70 C91 63 84 55 77 51 C70 46 77 39 70 30 C65 23 56 18 54 8 C52 15 49 21 47 26 C46 16 51 9 47 3Z" fill={`url(#${uid}-g)`} />
      {/* A5-style inset outline keeps the double-flame structure */}
      <path d="M50 24 C43 36 34 43 36 54 C38 62 32 68 35 77 C39 87 46 91 53 90 C62 89 68 83 65 75 C62 67 69 61 64 52 C60 44 54 36 50 24Z" fill="none" stroke="#fed7aa" strokeWidth="2" opacity="0.8" />
      <path d="M50 35 C45 44 40 51 42 59 C44 66 40 71 43 78 C46 84 51 87 55 84 C60 81 61 76 58 70 C56 64 61 59 58 52 C56 46 52 40 50 35Z" fill={`url(#${uid}-i)`} />
      <text x="51" y="72" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="26" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* ════════ GROUP D — Six focused follow-ups to C2 ════════ */

/* D1: Offset shell — inner core drifts inside a larger, multi-tongue contour */
function D1({ size = 72 }: LogoProps) {
  const uid = "d1";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-o`} x1="48" y1="98" x2="44" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="34%" stopColor="#dc2626" /><stop offset="68%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="56" y1="92" x2="47" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#991b1b" /><stop offset="55%" stopColor="#fb923c" /><stop offset="100%" stopColor="#fff7ed" />
        </linearGradient>
      </defs>
      <path d="M46 4 C42 15 36 20 31 27 C27 21 21 23 21 30 C21 36 27 39 22 46 C18 52 9 55 15 63 C20 69 27 67 21 76 C16 84 25 95 48 98 C67 100 88 91 79 80 C74 73 86 70 82 61 C78 54 70 51 77 43 C82 37 80 29 75 28 C70 27 67 34 64 37 C61 25 53 18 54 8 C51 15 48 21 46 27 C45 17 49 10 46 4Z" fill="none" stroke={`url(#${uid}-o)`} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M55 28 C47 37 39 46 41 56 C43 63 36 69 40 78 C44 88 52 92 60 88 C68 85 71 78 67 70 C64 62 71 58 65 48 C62 41 57 35 55 28Z" fill={`url(#${uid}-i)`} />
      <text x="54" y="72" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="26" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* D2: Split core — double aesthetic with two inner tongues instead of one teardrop */
function D2({ size = 72 }: LogoProps) {
  const uid = "d2";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-o`} x1="50" y1="98" x2="50" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="38%" stopColor="#dc2626" /><stop offset="72%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="50" y1="89" x2="50" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#b91c1c" /><stop offset="55%" stopColor="#fb923c" /><stop offset="100%" stopColor="#fef3c7" />
        </linearGradient>
      </defs>
      <path d="M50 4 C47 15 39 22 34 31 C30 25 25 24 23 29 C20 35 27 40 22 47 C18 53 11 57 16 64 C20 69 27 67 23 75 C18 84 28 96 50 97 C73 98 84 89 79 80 C75 72 83 69 80 62 C77 55 70 52 76 44 C81 37 77 29 72 29 C68 30 65 36 64 40 C60 30 53 22 53 11 C52 17 50 22 48 27 C48 18 52 10 50 4Z" fill="none" stroke={`url(#${uid}-o)`} strokeWidth="3.4" strokeLinejoin="round" />
      <path d="M50 29 C44 38 37 45 39 54 C41 61 34 67 38 76 C40 82 45 87 50 88 C54 87 58 82 60 76 C63 68 57 62 60 54 C62 47 56 38 50 29Z" fill={`url(#${uid}-i)`} />
      <path d="M45 43 C41 50 40 57 43 62 C45 66 43 70 45 75 C47 79 49 80 50 80 C49 72 52 67 49 60 C47 54 47 49 45 43Z" fill="#fff7ed" opacity="0.72" />
      <path d="M55 43 C59 50 60 57 57 62 C55 66 57 70 55 75 C53 79 51 80 50 80 C51 72 48 67 51 60 C53 54 53 49 55 43Z" fill="#fed7aa" opacity="0.62" />
      <text x="50" y="72" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="25" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* D3: Heavy ember — bold outlined outer shell, huge irregular inner fire */
function D3({ size = 72 }: LogoProps) {
  const uid = "d3";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-o`} x1="50" y1="98" x2="48" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="30%" stopColor="#dc2626" /><stop offset="65%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <radialGradient id={`${uid}-i`} cx="49" cy="62" r="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff7ed" /><stop offset="42%" stopColor="#fb923c" /><stop offset="100%" stopColor="#b91c1c" />
        </radialGradient>
      </defs>
      <path d="M47 4 C43 17 35 24 29 31 C25 25 19 28 20 35 C21 40 28 42 23 49 C18 56 9 59 16 67 C22 73 27 70 21 79 C16 88 28 97 50 98 C72 98 87 89 79 80 C73 72 84 69 80 61 C76 53 68 51 75 42 C80 36 77 28 72 29 C67 30 64 37 63 42 C60 29 51 22 53 8 C50 16 47 22 45 29 C45 18 49 10 47 4Z" fill="none" stroke={`url(#${uid}-o)`} strokeWidth="4.8" strokeLinejoin="round" />
      <path d="M49 21 C41 34 31 42 34 54 C36 63 28 69 33 80 C37 90 47 94 57 89 C68 84 72 76 67 67 C63 59 72 53 64 43 C59 36 52 29 49 21Z" fill={`url(#${uid}-i)`} />
      <text x="51" y="73" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="26" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* D4: Carved P — single continuous chaotic flame with a literal P-shaped void */
function D4({ size = 72 }: LogoProps) {
  const uid = "d4";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="98" x2="45" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="28%" stopColor="#dc2626" /><stop offset="58%" stopColor="#f97316" /><stop offset="84%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#fff7ed" />
        </linearGradient>
        <mask id={`${uid}-m`}>
          <rect width="100" height="100" fill="white" />
          {/* Lowered P — shifted six viewBox units into the belly */}
          <path d="M38 41 L38 82 L45 82 L45 66 L56 66 C64 66 68 61 68 53 C68 45 63 41 56 41 Z M45 48 L55 48 C59 48 61 50 61 53 C61 57 59 59 55 59 L45 59Z" fill="black" />
        </mask>
      </defs>
      {/* Sharper emoji-like silhouette: pointed side tongues instead of rounded lobes */}
      <path d="M47 4
        C44 16 35 23 29 32
        L24 26 L20 29 L23 38
        L14 45 L22 51
        L10 59 L20 65
        L15 76 L24 78
        C19 87 31 97 50 98
        C70 98 84 90 79 81
        L88 77 L80 68
        L90 61 L79 54
        L86 45 L76 39
        L80 30 L72 29
        C67 30 64 37 63 42
        C60 29 51 22 53 8
        C50 16 47 22 45 29
        C45 18 49 10 47 4Z"
        fill={`url(#${uid}-g)`}
        mask={`url(#${uid}-m)`}
      />
    </svg>
  );
}

/* D4L: D4 with the carved P shifted lower into the flame belly */
function D4L({ size = 72 }: LogoProps) {
  const uid = "d4l";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="98" x2="45" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="28%" stopColor="#dc2626" /><stop offset="58%" stopColor="#f97316" /><stop offset="84%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#fff7ed" />
        </linearGradient>
        <mask id={`${uid}-m`}>
          <rect width="100" height="100" fill="white" />
          {/* Same P as D4, translated down 6 viewBox units */}
          <path d="M38 41 L38 82 L45 82 L45 66 L56 66 C64 66 68 61 68 53 C68 45 63 41 56 41 Z M45 48 L55 48 C59 48 61 50 61 53 C61 57 59 59 55 59 L45 59Z" fill="black" />
        </mask>
      </defs>
      <path d="M47 4 C44 16 35 23 29 32 C25 26 19 28 20 35 C21 41 28 43 22 50 C16 57 9 60 16 67 C22 73 28 71 21 80 C16 89 29 98 50 98 C72 98 88 89 80 79 C74 72 85 68 80 60 C76 53 68 50 75 42 C80 35 77 28 72 29 C67 30 64 37 63 42 C60 29 51 22 53 8 C50 16 47 22 45 29 C45 18 49 10 47 4Z" fill={`url(#${uid}-g)`} mask={`url(#${uid}-m)`} />
    </svg>
  );
}

/* D5: Core P — single silhouette with a bright P-shaped inner tongue */
function D5({ size = 72 }: LogoProps) {
  const uid = "d5";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="98" x2="45" y2="3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="30%" stopColor="#dc2626" /><stop offset="64%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="50" y1="90" x2="50" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fb923c" /><stop offset="70%" stopColor="#fff7ed" /><stop offset="100%" stopColor="#fef3c7" />
        </linearGradient>
      </defs>
      <path d="M48 4 C44 17 35 24 29 33 C25 27 20 29 21 36 C22 41 28 44 23 50 C17 57 10 61 17 68 C22 73 28 71 22 80 C17 89 29 98 50 98 C72 98 87 89 80 80 C74 72 84 68 80 60 C76 53 69 50 75 42 C80 35 77 28 72 29 C67 30 64 37 63 42 C60 29 51 22 53 8 C50 16 47 22 45 29 C45 18 50 10 48 4Z" fill={`url(#${uid}-g)`} />
      <path d="M49 29 C44 39 39 47 41 57 L41 76 L47 76 L47 62 L56 62 C62 62 66 57 66 50 C66 43 62 39 56 39 L50 39 C51 35 51 32 49 29Z M47 45 L55 45 C58 45 60 47 60 50 C60 53 58 55 55 55 L47 55Z" fill={`url(#${uid}-i)`} />
    </svg>
  );
}

/* D6: Pure emoji flame — single broad flame, no inset outline, just hot layered tongues */
function D6({ size = 72 }: LogoProps) {
  const uid = "d6";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="98" x2="48" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="27%" stopColor="#dc2626" /><stop offset="55%" stopColor="#f97316" /><stop offset="80%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#fff7ed" />
        </linearGradient>
        <linearGradient id={`${uid}-i`} x1="50" y1="90" x2="50" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c2410c" /><stop offset="55%" stopColor="#fb923c" /><stop offset="100%" stopColor="#fff7ed" />
        </linearGradient>
      </defs>
      <path d="M47 3 C45 17 34 23 29 34 C25 42 32 47 24 53 C17 59 11 65 18 72 C23 77 17 84 22 90 C28 98 42 99 50 98 C62 99 78 96 82 87 C85 80 77 77 84 70 C91 63 85 55 77 51 C70 46 77 39 70 30 C65 23 56 18 54 8 C52 15 49 21 47 26 C46 16 51 9 47 3Z" fill={`url(#${uid}-g)`} />
      <path d="M50 35 C44 45 39 52 41 61 C43 68 39 73 43 80 C46 86 51 89 56 86 C62 82 63 76 59 69 C56 63 62 58 58 51 C56 45 52 40 50 35Z" fill={`url(#${uid}-i)`} />
      <text x="51" y="72" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="26" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* ════════ GROUP E — Simple directions ════════ */

/* E1: Gradient circle with a negative-space P */
function E1({ size = 72 }: LogoProps) {
  const uid = "e1";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="22" y1="82" x2="78" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="42%" stopColor="#ea580c" /><stop offset="72%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <mask id={`${uid}-m`}>
          <rect width="100" height="100" fill="white" />
          <path d="M37 74 L37 27 L55 27 C65 27 71 33 71 42 C71 51 65 57 55 57 L46 57 L46 74 Z M46 35 L46 49 L54 49 C59 49 62 47 62 42 C62 38 59 35 54 35 Z" fill="black" />
        </mask>
      </defs>
      <circle cx="50" cy="50" r="42" fill={`url(#${uid}-g)`} mask={`url(#${uid}-m)`} />
    </svg>
  );
}

/* E2: Rounded square / app tile with a negative-space P */
function E2({ size = 72 }: LogoProps) {
  const uid = "e2";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="16" y1="84" x2="84" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="40%" stopColor="#dc2626" /><stop offset="72%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <mask id={`${uid}-m`}>
          <rect width="100" height="100" fill="white" />
          <path d="M35 74 L35 26 L55 26 C66 26 72 32 72 42 C72 52 66 58 55 58 L45 58 L45 74 Z M45 35 L45 49 L54 49 C59 49 62 47 62 42 C62 37 59 35 54 35 Z" fill="black" />
        </mask>
      </defs>
      <rect x="9" y="9" width="82" height="82" rx="22" fill={`url(#${uid}-g)`} mask={`url(#${uid}-m)`} />
    </svg>
  );
}

/* E3: Gradient ember pill with a negative-space P */
function E3({ size = 72 }: LogoProps) {
  const uid = "e3";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="20" y1="80" x2="80" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#991b1b" /><stop offset="42%" stopColor="#ea580c" /><stop offset="74%" stopColor="#f97316" /><stop offset="100%" stopColor="#fef3c7" />
        </linearGradient>
        <mask id={`${uid}-m`}>
          <rect width="100" height="100" fill="white" />
          <path d="M31 72 L31 29 L53 29 C64 29 70 35 70 44 C70 53 64 59 53 59 L42 59 L42 72 Z M42 37 L42 51 L52 51 C57 51 60 49 60 44 C60 40 57 37 52 37 Z" fill="black" />
        </mask>
      </defs>
      <rect x="13" y="27" width="74" height="46" rx="23" fill={`url(#${uid}-g)`} mask={`url(#${uid}-m)`} />
    </svg>
  );
}

/* E4: Simple flame droplet with a solid P — one clean silhouette */
function E4({ size = 72 }: LogoProps) {
  const uid = "e4";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="93" x2="45" y2="7" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="38%" stopColor="#dc2626" /><stop offset="68%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <path d="M49 7 C42 22 27 32 24 49 C20 67 29 86 50 93 C71 86 80 67 76 49 C73 32 58 22 49 7Z" fill={`url(#${uid}-g)`} />
      <text x="50" y="68" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="29" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* E5: Orbit emblem — gradient core with a simple orbital ring */
function E5({ size = 72 }: LogoProps) {
  const uid = "e5";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="25" y1="78" x2="75" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="45%" stopColor="#ea580c" /><stop offset="75%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="28" fill={`url(#${uid}-g)`} />
      <ellipse cx="50" cy="50" rx="42" ry="17" transform="rotate(-25 50 50)" stroke="#fed7aa" strokeWidth="3" opacity="0.9" />
      <circle cx="82" cy="32" r="4" fill="#fde68a" />
      <text x="50" y="62" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="25" fill="white" opacity="0.95">P</text>
    </svg>
  );
}

/* E6: Geometric P with a tiny gradient spark — the simplest lettermark */
function E6({ size = 72 }: LogoProps) {
  const uid = "e6";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="24" y1="84" x2="74" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" /><stop offset="44%" stopColor="#ea580c" /><stop offset="75%" stopColor="#f97316" /><stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      <path d="M29 85 L29 24 L52 24 C65 24 72 31 72 42 C72 53 65 60 52 60 L41 60 L41 85 Z M41 35 L41 49 L51 49 C56 49 59 47 59 42 C59 38 56 35 51 35 Z" fill={`url(#${uid}-g)`} />
      <path d="M78 10 C76 14 72 16 73 20 C74 23 77 24 79 21 C81 24 85 22 85 19 C85 15 81 13 78 10Z" fill="#fde68a" />
    </svg>
  );
}

/* ════════ GROUP B — Completely new ideas ════════ */

/* B1: Bold P with flame gradient fill — no flame shape at all */
function B1({ size = 72 }: LogoProps) {
  const uid = "b1";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="95" x2="50" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="30%" stopColor="#dc2626" />
          <stop offset="55%" stopColor="#ea580c" />
          <stop offset="80%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      {/* P as a bold geometric letter with gradient */}
      <path
        d="M25 90 L25 12 L52 12 C66 12, 74 20, 74 32 C74 44, 66 52, 52 52 L39 52 L39 90 Z
           M39 25 L39 39 L50 39 C55 39, 58 36, 58 32 C58 28, 55 25, 50 25 Z"
        fill={`url(#${uid}-g)`}
      />
      {/* Small flame spark above the P */}
      <path
        d="M50 2 C48 6, 44 8, 44 12 C44 15, 47 16, 50 14 C53 16, 56 15, 56 12 C56 8, 52 6, 50 2Z"
        fill="#fde68a"
        opacity="0.8"
      />
    </svg>
  );
}

/* B2: Hexagonal badge with P and flame accent */
function B2({ size = 72 }: LogoProps) {
  const uid = "b2";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="90" x2="50" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="50%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      {/* Hexagon */}
      <path
        d="M50 8 L84 28 L84 72 L50 92 L16 72 L16 28 Z"
        fill={`url(#${uid}-g)`}
        stroke="#fde68a"
        strokeWidth="1.5"
        opacity="0.95"
      />
      {/* Inner hexagon — darker */}
      <path
        d="M50 22 L72 35 L72 65 L50 78 L28 65 L28 35 Z"
        fill="#1a0a05"
        opacity="0.4"
      />
      {/* P — centered */}
      <text x="50" y="60" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="34" fill="#fde68a" opacity="0.95">P</text>
      {/* Small flame on top vertex */}
      <path
        d="M50 2 C48 5, 45 7, 46 10 C47 12, 49 11, 50 10 C51 11, 53 12, 54 10 C55 7, 52 5, 50 2Z"
        fill="#fde68a"
      />
    </svg>
  );
}

/* B3: P where the bowl curls into a flame tip */
function B3({ size = 72 }: LogoProps) {
  const uid = "b3";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="90" x2="50" y2="5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="30%" stopColor="#dc2626" />
          <stop offset="60%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      {/* P with the bowl curling up into a flame tip */}
      <path
        d="M28 92 L28 15 L52 15
           C65 15, 72 23, 72 34
           C72 45, 65 53, 52 53
           L41 53
           L41 92 Z
           M41 28 L41 40 L50 40
           C55 40, 58 37, 58 34
           C58 31, 55 28, 50 28 Z
           /* Flame tip rising from the bowl */
           M58 34
           C62 28, 66 22, 68 14
           C70 8, 68 4, 64 3
           C66 8, 64 14, 60 20
           C58 26, 56 30, 58 34 Z"
        fill={`url(#${uid}-g)`}
        fillRule="evenodd"
      />
    </svg>
  );
}

/* B4: Minimalist spark/ember — 3 ascending dots + P */
function B4({ size = 72 }: LogoProps) {
  const uid = "b4";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="90" x2="50" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      {/* P — clean, rounded */}
      <path
        d="M30 88 L30 20 L54 20
           C66 20, 73 27, 73 38
           C73 49, 66 56, 54 56
           L43 56 L43 88 Z
           M43 33 L43 43 L52 43
           C57 43, 60 41, 60 38
           C60 35, 57 33, 52 33 Z"
        fill={`url(#${uid}-g)`}
      />
      {/* Three ascending sparks above P */}
      <circle cx="50" cy="12" r="3" fill="#fde68a" />
      <circle cx="60" cy="7" r="2" fill="#f97316" />
      <circle cx="68" cy="3" r="1.5" fill="#ea580c" />
    </svg>
  );
}

/* B5: Circular emblem — P in a ring with flame at top */
function B5({ size = 72 }: LogoProps) {
  const uid = "b5";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${uid}-g`} x1="50" y1="90" x2="50" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="50%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id={`${uid}-f`} x1="50" y1="12" x2="50" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      {/* Outer ring */}
      <circle cx="50" cy="55" r="38" fill="none" stroke={`url(#${uid}-g)`} strokeWidth="4" />
      {/* Inner fill — subtle */}
      <circle cx="50" cy="55" r="33" fill="#1a0a05" opacity="0.3" />
      {/* P — centered */}
      <text x="50" y="68" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="36" fill={`url(#${uid}-g)`}>P</text>
      {/* Flame at top of ring */}
      <path
        d="M50 6 C47 11, 43 14, 44 19 C45 22, 48 23, 50 21 C52 23, 55 22, 56 19 C57 14, 53 11, 50 6Z"
        fill={`url(#${uid}-f)`}
      />
    </svg>
  );
}

/* ════════ Layout ════════ */

const REFINE_OPTIONS = [
  { id: "A1", name: "Cleaner Flame", desc: "Smoother bezier curves, symmetric, P vertically centered in core", Comp: A1 },
  { id: "A2", name: "Negative Space P", desc: "P is cut out of the flame shape (mask) — no text element", Comp: A2 },
  { id: "A3", name: "Soft Glow", desc: "Rounded blob flame with radial inner glow, P centered", Comp: A3 },
  { id: "A4", name: "Angular / Crystalline", desc: "Sharp straight edges, geometric, darker inner cutout", Comp: A4 },
  { id: "A5", name: "Double Flame", desc: "Outer outlined flame + inner solid flame, P centered between", Comp: A5 },
];

const FOLLOWUP_OPTIONS = [
  { id: "D4", name: "Carved P", desc: "One continuous chaotic flame with the P punched out as negative space", Comp: D4 },
  { id: "D4L", name: "Carved P — Lower", desc: "Same D4 flame, with the negative-space P shifted six units lower", Comp: D4L },
  { id: "D1", name: "Offset Shell", desc: "The inner core drifts inside a larger multi-tongue outer contour", Comp: D1 },
  { id: "D2", name: "Split Core", desc: "Double flame with two inner tongues instead of one orderly teardrop", Comp: D2 },
  { id: "D3", name: "Heavy Ember", desc: "Bold outlined shell surrounding a much larger, irregular inner fire", Comp: D3 },
  { id: "D5", name: "Core P", desc: "Single flame with a bright P-shaped inner tongue — no outer outline", Comp: D5 },
  { id: "D6", name: "Pure Emoji Flame", desc: "Single broad emoji-like flame with hot layered tongues and no outline", Comp: D6 },
];

const CHAOTIC_OPTIONS = [
  { id: "C1", name: "Licked Outline", desc: "Asymmetric outer contour with a hooked tip and a calmer inner flame", Comp: C1 },
  { id: "C2", name: "Three-Tongue", desc: "Visible side licks and three unpredictable tongues around the A5 structure", Comp: C2 },
  { id: "C3", name: "Windblown", desc: "The whole flame leans left like real fire moving in a breeze", Comp: C3 },
  { id: "C4", name: "Scratched Ember", desc: "Mismatched hand-drawn outlines create a rough, energetic edge", Comp: C4 },
  { id: "C5", name: "Emoji Flame", desc: "Big rounded silhouette with multiple tongues and a hot yellow inner flame", Comp: C5 },
];

const SIMPLE_OPTIONS = [
  { id: "E1", name: "Gradient Circle", desc: "A pure gradient-filled circle with the P cut out in negative space", Comp: E1 },
  { id: "E2", name: "Rounded Tile", desc: "App-icon-like rounded square with a negative-space P", Comp: E2 },
  { id: "E3", name: "Ember Pill", desc: "A compact horizontal ember shape with the P cut out", Comp: E3 },
  { id: "E4", name: "Simple Flame", desc: "One clean flame droplet with a solid white P", Comp: E4 },
  { id: "E5", name: "Orbit Core", desc: "Gradient core with a single orbit ring and P", Comp: E5 },
  { id: "E6", name: "P + Spark", desc: "Minimal geometric P with a tiny gradient spark", Comp: E6 },
];

const NEW_OPTIONS = [
  { id: "B1", name: "Bold P + Spark", desc: "No flame shape — just a heavy P with fire gradient and a small spark above", Comp: B1 },
  { id: "B2", name: "Hex Badge", desc: "Hexagonal shield with P and flame accent on top vertex", Comp: B2 },
  { id: "B3", name: "P → Flame Curl", desc: "The bowl of the P curls upward into a flame tip — letter and flame are one", Comp: B3 },
  { id: "B4", name: "P + Ascending Sparks", desc: "Clean P with three ascending ember dots — minimal, modern", Comp: B4 },
  { id: "B5", name: "Ring Emblem", desc: "Circular crest with P and a flame at the crown — badge/crest feel", Comp: B5 },
];

function LogoCard({ id, name, desc, Comp }: { id: string; name: string; desc: string; Comp: React.FC<LogoProps> }) {
  return (
    <div className="bg-[#1a1208]/80 border border-amber-900/30 rounded-2xl p-6 flex flex-col items-center gap-4 hover:border-amber-700/40 transition-colors">
      <div className="w-24 h-24 flex items-center justify-center bg-[#0d0a08] rounded-xl">
        <Comp size={64} />
      </div>
      <div className="text-center">
        <p className="text-amber-200 font-semibold text-sm">
          <span className="text-orange-400/70 mr-1.5">{id}</span>
          {name}
        </p>
        <p className="text-amber-400/40 text-xs mt-1.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function LogoShowcase() {
  return (
    <div className="min-h-screen bg-[#0d0a08] px-6 py-12 max-w-5xl mx-auto">
      <Link href="/" className="text-amber-400/50 text-sm hover:text-amber-200 transition mb-8 inline-block">
        ← Back to Piro
      </Link>

      <h1 className="text-3xl font-bold text-amber-50 mb-2">Logo Options</h1>
      <p className="text-amber-400/50 text-sm mb-10">
        5 refinements of the current flame+P aesthetic · 5 completely new directions. Click any to view at scale.
      </p>

      {/* Group A — Refine */}
      <h2 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wide mb-5">
        A — Refine Current Aesthetic
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
        {REFINE_OPTIONS.map((o) => (
          <LogoCard key={o.id} {...o} />
        ))}
      </div>

      {/* Group C — Chaotic A5 */}
      <h2 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wide mb-2">
        C — A5, But More Like 🔥
      </h2>
      <p className="text-amber-400/50 text-sm mb-5">Same double-flame structure, less symmetry and more real-fire chaos.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
        {CHAOTIC_OPTIONS.map((o) => (
          <LogoCard key={o.id} {...o} />
        ))}
      </div>

      {/* Group D — Follow-up options */}
      <h2 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wide mb-2">
        D — C2 Follow-ups
      </h2>
      <p className="text-amber-400/50 text-sm mb-5">Three double-flame directions, then three single-flame directions.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
        {FOLLOWUP_OPTIONS.map((o) => (
          <LogoCard key={o.id} {...o} />
        ))}
      </div>

      <div className="bg-[#1a1208]/80 border border-orange-500/30 rounded-2xl p-6 mb-12">
        <p className="text-orange-300/80 text-xs font-semibold uppercase tracking-wide mb-4">D4 vs D4L — P position comparison</p>
        <div className="flex items-end gap-10">
          {[FOLLOWUP_OPTIONS[0], FOLLOWUP_OPTIONS[1]].map((o) => (
            <div key={o.id} className="flex flex-col items-center gap-2">
              <div className="bg-[#0d0a08] rounded-xl px-6 py-4"><o.Comp size={110} /></div>
              <span className="text-amber-200 text-sm font-semibold">{o.id}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Group E — Simple */}
      <h2 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wide mb-2">
        E — Simple Directions
      </h2>
      <p className="text-amber-400/50 text-sm mb-5">Less shape, more identity: gradients, geometry, and the P.</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
        {SIMPLE_OPTIONS.map((o) => (
          <LogoCard key={o.id} {...o} />
        ))}
      </div>

      {/* Group B — New */}
      <h2 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wide mb-5">
        B — Completely New Ideas
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
        {NEW_OPTIONS.map((o) => (
          <LogoCard key={o.id} {...o} />
        ))}
      </div>

      {/* Size comparison for all 15 */}
      <h2 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wide mb-5">
        Size Comparison (22px sidebar · 52px login · 72px hero)
      </h2>
      <div className="bg-[#1a1208]/80 border border-amber-900/30 rounded-2xl p-8 overflow-x-auto">
        <div className="flex items-end gap-10">
          {[...REFINE_OPTIONS, ...CHAOTIC_OPTIONS, ...FOLLOWUP_OPTIONS, ...SIMPLE_OPTIONS, ...NEW_OPTIONS].map((o) => (
            <div key={o.id} className="flex flex-col items-center gap-3 shrink-0">
              <div className="flex items-end gap-3 bg-[#0d0a08] px-4 py-3 rounded-xl">
                <o.Comp size={22} />
                <o.Comp size={52} />
                <o.Comp size={72} />
              </div>
              <span className="text-amber-400/40 text-xs">{o.id}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
