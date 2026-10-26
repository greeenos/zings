/** The Zings logo (emerald tray, media/zings-logo-source.png), used wherever the brand appears. */
export function BrandMark({ className = "h-9 w-9" }: { className?: string }) {
  return <span className={`brand-mark inline-flex shrink-0 items-center justify-center ${className}`} aria-hidden="true">
    <img src="/brand-icon.png" width="512" height="512" decoding="async" alt="" className="h-full w-full object-contain" />
  </span>;
}
