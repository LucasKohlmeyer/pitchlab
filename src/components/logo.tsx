export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-base font-semibold tracking-tight text-ink">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="#f0efec" />
        <path d="M8 5.5c4 5.5 4 15.5 0 21" fill="none" stroke="#e66767" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M24 5.5c-4 5.5-4 15.5 0 21" fill="none" stroke="#e66767" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      PitchLab
    </span>
  );
}
