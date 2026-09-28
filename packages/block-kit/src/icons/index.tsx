/**
 * Inline SVG icons approximating Slack's "Slack v2" icon font glyphs. We can't ship the icon
 * font, so these are hand-drawn strokes matched to the reference snapshots' `<path>` bounding
 * boxes (20x20 viewBox, ~9x5 chevron, 13x13 glyphs) rather than a generic icon set.
 */
import type { SVGProps } from "react";

export function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6.25 8L10 11.75L13.75 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Slack's calendar, traced from its icon font's `calendar` glyph (2000 units to the em, 1700 above
 * the baseline), so it lands in a square box exactly where the glyph sits in an em.
 */
export function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 2000 2000" width="20" height="20" aria-hidden="true" {...props}>
      <path
        transform="matrix(1 0 0 -1 0 1700)"
        fill="currentColor"
        d="M350 1600C212 1600 100 1487 100 1349V51C100 -87 212 -200 350 -200H1649C1787 -200 1900 -87 1900 51V1349C1900 1487 1787 1600 1649 1600ZM1649 1450C1705 1450 1750 1405 1750 1349V1200H250V1349C250 1405 295 1450 350 1450ZM350 -50C295 -50 250 -5 250 51V1050H1750V51C1750 -5 1705 -50 1649 -50ZM1001 900C945 900 901 855 901 800C901 744 945 700 1001 700C1056 700 1101 745 1101 800C1101 856 1056 900 1001 900ZM1401 900C1345 900 1301 855 1301 800C1301 744 1345 700 1401 700C1456 700 1501 745 1501 800C1501 856 1456 900 1401 900ZM601 600C545 600 501 555 501 500C501 444 545 400 601 400C656 400 701 445 701 500C701 556 656 600 601 600ZM1001 600C945 600 901 555 901 500C901 444 945 400 1001 400C1056 400 1101 445 1101 500C1101 556 1056 600 1001 600ZM1401 600C1345 600 1301 555 1301 500C1301 444 1345 400 1401 400C1456 400 1501 445 1501 500C1501 556 1456 600 1401 600ZM601 300C545 300 501 255 501 200C501 144 545 100 601 100C656 100 701 145 701 200C701 256 656 300 601 300ZM1001 300C945 300 901 255 901 200C901 144 945 100 1001 100C1056 100 1101 145 1101 200C1101 256 1056 300 1001 300ZM1401 300C1345 300 1301 255 1301 200C1301 144 1345 100 1401 100C1456 100 1501 145 1501 200C1501 256 1456 300 1401 300Z"
      />
    </svg>
  );
}

/** Slack's clock: a full-size 1.5-stroke ring with an L-shaped hand pointing at three o'clock. */
export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.75 5.75V10.25H13.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" {...props}>
      <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.5 7.2L5.3 10L11.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Slack's `trash` glyph. */
export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.75 1A2.25 2.25 0 0 0 6.5 3.25v.25H4.25A2.25 2.25 0 0 0 2 5.75v1.5c0 .414.336.75.75.75h.75v8.25a2.25 2.25 0 0 0 2.25 2.25h8.5a2.25 2.25 0 0 0 2.25-2.25V8h.75a.75.75 0 0 0 .75-.75v-1.5a2.25 2.25 0 0 0-2.25-2.25H13.5v-.25A2.25 2.25 0 0 0 11.25 1zM12 3.5v-.25a.75.75 0 0 0-.75-.75h-2.5a.75.75 0 0 0-.75.75v.25zM7.25 5h-3a.75.75 0 0 0-.75.75v.75h13v-.75a.75.75 0 0 0-.75-.75zM5 8h10v8.25a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75zm3.25 1.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5a.75.75 0 0 1 .75-.75m4.25.75a.75.75 0 0 0-1.5 0v4.5a.75.75 0 0 0 1.5 0z"
      />
    </svg>
  );
}

/** Slack's `thumbs-up` glyph. */
export function ThumbsUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.457 3.036a.903.903 0 0 1 1.69.626l-.362 1.205-.996 2.987a.75.75 0 0 0 .825.978l3.644-.559a1.25 1.25 0 0 1 1.413 1.493l-.861 4.092a3.25 3.25 0 0 1-2.543 2.518l-.057.011a11.3 11.3 0 0 1-4.42-.001l-2.04-.41V7.951l.14-.111a11.7 11.7 0 0 0 3.377-4.377zM6.043 6.595a10.2 10.2 0 0 0 2.854-3.742l.19-.427a2.403 2.403 0 0 1 4.496 1.667l-.365 1.216-.007.022-.61 1.832 2.43-.373a2.75 2.75 0 0 1 3.108 3.285l-.862 4.092a4.75 4.75 0 0 1-3.716 3.68l-.057.01a12.8 12.8 0 0 1-5.008 0l-1.763-.354a.75.75 0 0 1-.733.59H3.653A2.653 2.653 0 0 1 1 15.442V7.344a.75.75 0 0 1 .75-.75H6zM5.25 8.094v8.5H3.653A1.153 1.153 0 0 1 2.5 15.44V8.094z"
      />
    </svg>
  );
}

/** Slack's `thumbs-down` glyph. */
export function ThumbsDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.957 16.57a.903.903 0 0 0 1.69-.627l-.362-1.205-.996-2.986a.75.75 0 0 1 .825-.979l3.644.56a1.25 1.25 0 0 0 1.413-1.494l-.861-4.092a3.25 3.25 0 0 0-2.543-2.517l-.057-.012a11.3 11.3 0 0 0-4.42.002l-2.04.41v8.024l.14.112a11.7 11.7 0 0 1 3.377 4.377zm-4.414-3.56a10.2 10.2 0 0 1 2.854 3.742l.19.427a2.403 2.403 0 0 0 4.496-1.667l-.365-1.216-.007-.022-.61-1.832 2.43.373a2.75 2.75 0 0 0 3.108-3.285l-.862-4.092a4.75 4.75 0 0 0-3.716-3.679l-.057-.011a12.8 12.8 0 0 0-5.008.001l-1.763.354a.75.75 0 0 0-.733-.591H4.153A2.653 2.653 0 0 0 1.5 4.165v8.097a.75.75 0 0 0 .75.75H6.5q.022 0 .043-.002m-.793-1.498v-8.5H4.153C3.516 3.012 3 3.528 3 4.165v7.347z"
      />
    </svg>
  );
}

export function KebabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="13"
      height="13"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <circle cx="4" cy="10" r="1.7" />
      <circle cx="10" cy="10" r="1.7" />
      <circle cx="16" cy="10" r="1.7" />
    </svg>
  );
}

/** Slack's `file-upload` glyph (document with an up arrow), used by file_input. */
export function FileUploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.25 1.5A3.75 3.75 0 0 0 2.5 5.25v5a.75.75 0 0 0 1.5 0v-5A2.25 2.25 0 0 1 6.25 3h6.5c.393 0 .764.185 1 .5l2 2.667c.162.216.25.48.25.75v7.833A2.25 2.25 0 0 1 13.75 17h-4a.75.75 0 0 0 0 1.5h4a3.75 3.75 0 0 0 3.75-3.75V6.917a2.75 2.75 0 0 0-.55-1.65l-2-2.667a2.75 2.75 0 0 0-2.2-1.1zm6.25 3.25a.75.75 0 0 0-1.5 0v2.5c0 .414.336.75.75.75h2.5a.75.75 0 0 0 0-1.5H12.5zm-8 9.81v3.19a.75.75 0 0 0 1.5 0v-3.19l1.22 1.22a.75.75 0 0 0 1.06-1.06l-2.5-2.5a.75.75 0 0 0-1.06 0l-2.5 2.5a.75.75 0 1 0 1.06 1.06z"
      />
    </svg>
  );
}

export function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 5H5.5C4.7 5 4 5.7 4 6.5V14.5C4 15.3 4.7 16 5.5 16H13.5C14.3 16 15 15.3 15 14.5V12"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M11 4H16V9M16 4L9 11"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LockIcon(props: SVGProps<SVGSVGElement>) {
  // Slack's lock on its 20-unit grid: a 1.5-stroke body with a 3.75-radius shackle.
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true" {...props}>
      <rect
        x="3.75"
        y="8.25"
        width="12.5"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M6.25 8.25V6a3.75 3.75 0 0 1 7.5 0v2.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ChannelHashIcon(props: SVGProps<SVGSVGElement>) {
  // Slack's channel "#": two bars and two slashes leaning 10 degrees, all 1.5 wide.
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9 2.75L6.5 17.25M13.75 2.75L11.25 17.25M3.75 6.75H16.25M2.75 13.75H15.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Slack's `close` icon, its filled path as Slack ships it. */
export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16.53 3.47a.75.75 0 0 1 0 1.06L11.06 10l5.47 5.47a.75.75 0 0 1-1.06 1.06L10 11.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L8.94 10 3.47 4.53a.75.75 0 0 1 1.06-1.06L10 8.94l5.47-5.47a.75.75 0 0 1 1.06 0"
      />
    </svg>
  );
}

export function EmailIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true" {...props}>
      <rect x="2.5" y="5" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.2 5.8L10 11L16.8 5.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LinkGlyphIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true" {...props}>
      <path d="M8.5 11.5L11.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M9.5 6.5L11 5C12.4 3.6 14.6 3.6 16 5V5C17.4 6.4 17.4 8.6 16 10L14.5 11.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M10.5 13.5L9 15C7.6 16.4 5.4 16.4 4 15V15C2.6 13.6 2.6 11.4 4 10L5.5 8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ReturnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 8.5V10.5C4 11.6 4.9 12.5 6 12.5H15M15 12.5L11.5 9.5M15 12.5L11.5 15.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WorkflowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden="true" {...props}>
      <rect x="2.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="13.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M6.5 10.5H8.5C9.6 10.5 10.4 9.7 10.4 8.6V5.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M6.5 10.5H8.5C9.6 10.5 10.4 11.3 10.4 12.4V15.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="10.5" cy="3.5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/** Slack's `download` glyph (cloud with a down arrow), from the table action group. */
export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M11.75 4a3.75 3.75 0 0 0-3.512 2.432.75.75 0 0 1-.941.447 2.5 2.5 0 0 0-2.937 3.664.75.75 0 0 1-.384 1.093A2.251 2.251 0 0 0 4.75 16h9.5a3.25 3.25 0 0 0 1.44-6.164.75.75 0 0 1-.379-.908A3.75 3.75 0 0 0 11.75 4M7.108 5.296a5.25 5.25 0 0 1 9.786 3.508A4.75 4.75 0 0 1 14.25 17.5h-9.5a3.75 3.75 0 0 1-2.02-6.91 4 4 0 0 1 4.378-5.294M10.25 7.5a.75.75 0 0 1 .75.75v3.69l1.22-1.22a.75.75 0 1 1 1.06 1.06l-2.5 2.5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06l1.22 1.22V8.25a.75.75 0 0 1 .75-.75"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Slack's `copy` glyph (two stacked squares). */
export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M7.75 1.5A2.25 2.25 0 0 0 5.5 3.75v8.5a2.25 2.25 0 0 0 2.25 2.25h8.5a2.25 2.25 0 0 0 2.25-2.25v-8.5a2.25 2.25 0 0 0-2.25-2.25zM7 3.75A.75.75 0 0 1 7.75 3h8.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75zM3.75 5.5A2.25 2.25 0 0 0 1.5 7.75v8.5a2.25 2.25 0 0 0 2.25 2.25h8.5a2.25 2.25 0 0 0 2.25-2.25V16H13v.25a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75v-8.5A.75.75 0 0 1 3.75 7H4V5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Slack's `open-in-window` glyph, from the image action group. */
export function OpenInWindowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M2.5 8.507C2.5 7.675 3.175 7 4.007 7H5.5v.793l-3 3zm3 2.949V9.207l-3 3v2.586l3.017-3.017a3 3 0 0 1-.017-.32m-2.982 4.733 3.326-3.326q.055.105.117.205a3.06 3.06 0 0 0 1.167 1.097l-3.317 3.318a1.550 1.550 0 0 1-1.293-1.294M5.207 17.5l3-3q.171.02.35.02h2.216l-2.980 2.980zm4 0h2.250c.852 0 1.543-.691 1.543-1.544v-1.435h-.813zm5.293-3v1.456A3.044 3.044 0 0 1 11.456 19H4.044A3.044 3.044 0 0 1 1 15.956v-7.45A3.007 3.007 0 0 1 4.007 5.5H5.5V4.044A3.044 3.044 0 0 1 8.544 1h7.412A3.044 3.044 0 0 1 19 4.044v7.412a3.044 3.044 0 0 1-3.044 3.044zm-7.263-2.222c.273.434.757.722 1.307.722h7.412c.852 0 1.544-.691 1.544-1.544V4.044c0-.853-.692-1.544-1.544-1.544H8.544C7.690 2.5 7 3.191 7 4.044v2.760q.013.096.013.196v4.477c0 .293.082.568.224.801m3.337-6.396a.75.75 0 0 1 0-1.500h4.266a.75.75 0 0 1 .75.75v4.266a.75.75 0 0 1-1.500 0V6.911l-3.443 3.443a.75.75 0 1 1-1.060-1.060l3.410-3.412z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Slack's `ellipsis-vertical-filled` glyph ("More actions"). */
export function EllipsisVerticalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10 5.5A1.75 1.75 0 1 1 10 2a1.75 1.75 0 0 1 0 3.5m0 6.25a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5m-1.75 4.5a1.75 1.75 0 1 0 3.5 0 1.75 1.75 0 0 0-3.5 0"
        clipRule="evenodd"
      />
    </svg>
  );
}
