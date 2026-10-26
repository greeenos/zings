import { SVGProps } from "react";

/**
 * Custom "auto theme" glyph: a disc split along the NE–SW diagonal into a
 * sunlit day side (rays, upper-left) and a filled night side (lower-right).
 * It signals the theme that follows sunrise & sunset. Drawn on lucide's 24px
 * grid so it sits flush beside <Sun /> and <Moon /> in the toggle.
 */
export function SunHorizon({
  className,
  strokeWidth = 2,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Night side — filled lower-right half, split on the diagonal */}
      <path d="M16.24 7.76A6 6 0 0 1 7.76 16.24Z" fill="currentColor" stroke="none" />
      {/* Disc outline */}
      <circle cx="12" cy="12" r="6" />
      {/* Sun rays over the day (upper-left) side */}
      <path d="M12 1.5v2" />
      <path d="M4.22 4.22l1.42 1.42" />
      <path d="M1.5 12h2" />
    </svg>
  );
}
