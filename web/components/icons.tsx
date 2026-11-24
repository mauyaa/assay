const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Check = (p: { className?: string }) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

export const Cross = (p: { className?: string }) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </svg>
);

export const Spinner = (p: { className?: string }) => (
  <svg {...base} className={`spin ${p.className ?? ""}`} aria-hidden>
    <path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5" />
  </svg>
);

export const Search = (p: { className?: string }) => (
  <svg {...base} className={p.className} aria-hidden>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5l3 3" />
  </svg>
);

export const Plus = (p: { className?: string }) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M8 3v10M3 8h10" />
  </svg>
);

export const ArrowUpRight = (p: { className?: string }) => (
  <svg {...base} width={12} height={12} className={p.className} aria-hidden>
    <path d="M5 11l6-6M6 5h5v5" />
  </svg>
);

const ANVIL = "M2 10H29V15H22C20.2 15 19.5 16.4 19.5 18V20H23V24H9V20H12.5V18C12.5 16.4 11.8 15 10 15H8.5C5.3 15 3 13.2 2 10Z";

/** Assay mark: an anvil, and the green spark that means "verified" throughout the app. */
export const Logo = ({ size = 22, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" className={className} role="img" aria-label="Assay">
    <g transform="translate(0 2)">
      <path d={ANVIL} fill="var(--color-text-primary)" />
      <circle cx="25.5" cy="5" r="2.4" fill="var(--color-success)" />
    </g>
  </svg>
);
