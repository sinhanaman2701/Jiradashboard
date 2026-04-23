export function AnacityLogo({
  variant = "header",
}: {
  variant?: "header" | "login";
}) {
  const compact = variant === "header";
  const wordmarkColor = compact ? "#f8fafc" : "#0b160f";

  return (
    <span className={`anacity-logo anacity-logo-${variant}`} aria-label="Anacity">
      <svg
        className="anacity-logo-svg"
        viewBox={compact ? "0 0 320 76" : "0 0 410 98"}
        role="img"
        aria-hidden="true"
      >
        <g transform={compact ? "translate(6 6)" : "translate(8 6)"}>
          <path d="M18 58 L38 8 L58 58 Z" fill="none" stroke="#a84ab1" strokeWidth={compact ? "7" : "8"} strokeLinejoin="round" />
          <path d="M20 12 C10 28 11 49 24 63" fill="none" stroke="#a84ab1" strokeWidth={compact ? "7" : "8"} strokeLinecap="round" />
          <path d="M46 12 C59 18 68 29 70 43" fill="none" stroke="#d53f8c" strokeWidth={compact ? "7" : "8"} strokeLinecap="round" />
          <path d="M24 63 C39 69 55 66 67 55" fill="none" stroke="#d53f8c" strokeWidth={compact ? "7" : "8"} strokeLinecap="round" />
        </g>
        <text x={compact ? 78 : 88} y={compact ? "41" : "43"} fill={wordmarkColor} fontSize={compact ? "44" : "54"} fontWeight="900" fontFamily="Arial, Helvetica, sans-serif" letterSpacing="-1.5">
          ANACITY
        </text>
        {!compact && (
          <>
            <line x1="90" y1="54" x2="402" y2="54" stroke="#9a4aa9" strokeWidth="2" />
            <text x="90" y="79" fill="#0b160f" fontSize="20" fontWeight="700" fontFamily="Arial, Helvetica, sans-serif">
              Powering Smarter Communities
            </text>
          </>
        )}
      </svg>
    </span>
  );
}
