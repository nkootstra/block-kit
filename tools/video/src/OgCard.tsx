// oxlint-disable-next-line import/no-unassigned-import -- the card's fonts, loaded for their @font-face
import "@fontsource-variable/geist";
// oxlint-disable-next-line import/no-unassigned-import -- as above
import "@fontsource-variable/geist-mono";
import { useEffect, useState } from "react";
import {
  cancelRender,
  continueRender,
  delayRender,
  Img,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
// The landing page's own words, logo and proof captures, so the card never drifts from the page.
import logo from "../../../apps/site/public/icon.svg";
import proofOurs from "../../../apps/site/src/assets/proof/deploy-approval.actual.png";
import proofDiff from "../../../apps/site/src/assets/proof/deploy-approval.diff.png";
import proofSlack from "../../../apps/site/src/assets/proof/deploy-approval.reference.png";
import {
  BLOCK_ENDS,
  FEATHER as FEATHER_FRACTION,
  PIXELS,
  REVEAL as REVEAL_FRACTIONS,
  SOURCE,
  TOKENS,
} from "../../../apps/site/src/lib/proof";
import { headline } from "../../../apps/site/src/lib/site";
// oxlint-disable-next-line import/no-unassigned-import -- the card's stylesheet
import "./og.css";

/**
 * The animated social card. Block Kit JSON types itself and block-kit's render of it unrolls block
 * by block as each block closes. A divider then wipes between Slack's capture and block-kit's, and a
 * scan runs down the pixel diff while the badge counts to the site's pixel claim. Every frame is a
 * pure function of the frame number. Frame 0 is the finished card, so anything that shows only the
 * first frame still gets the whole story, and the loop ends where it starts.
 */

// The timeline, in ms. Each phase starts where the previous one ends.
const HOLD = 1800;
const RESET = 450;
const TYPE = 4400;
const SETTLE = 500;
const WIPE = 2400;
const SCAN = 1900;
export const DURATION = HOLD + RESET + TYPE + SETTLE + WIPE + SCAN;

const T_RESET = HOLD;
const T_TYPE = T_RESET + RESET;
const T_SETTLE = T_TYPE + TYPE;
const T_WIPE = T_SETTLE + SETTLE;
const T_SCAN = T_WIPE + WIPE;
// Within the scan: the diff fades in, the scan line runs down, the message fades back.
const SCAN_IN = 250;
const SCAN_RUN = 1150;
const SCAN_OUT = 350;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const progress = (t: number, start: number, length: number) => clamp((t - start) / length);
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

const LINES = SOURCE.split("\n").length;

/** Characters typed at time `t`. */
function typedAt(t: number) {
  if (t < T_TYPE || t >= T_SETTLE) return SOURCE.length;
  return Math.round(easeInOut(progress(t, T_TYPE, TYPE)) * SOURCE.length);
}

/** When the block that closes at `index` appears, by inverting the typing curve. */
function timeOfChar(index: number) {
  let lo = T_TYPE;
  let hi = T_SETTLE;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (typedAt(mid) >= index) hi = mid;
    else lo = mid;
  }
  return hi;
}
const BLOCK_TIMES = BLOCK_ENDS.map(timeOfChar);

const LINE_HEIGHT = 21;
const VISIBLE_LINES = 18;

function Code({ t }: { t: number }) {
  const typed = typedAt(t);
  const fade = t >= T_RESET && t < T_TYPE ? 1 - easeOut(progress(t, T_RESET, RESET * 0.7)) : 1;
  const shown = t >= T_RESET && t < T_TYPE ? SOURCE.length : typed;
  const caretLine = SOURCE.slice(0, shown).split("\n").length;
  const scroll = Math.max(0, caretLine - VISIBLE_LINES + 1) * LINE_HEIGHT;
  const typing = t >= T_TYPE && t < T_SETTLE;
  const caretOn = typing || Math.floor(t / 530) % 2 === 0;

  return (
    <div className="og-code">
      <div className="og-code__bar">
        <span className="og-code__dot" />
        <span className="og-code__dot" />
        <span className="og-code__dot" />
        <span className="og-code__file">deploy-approval.ts</span>
      </div>
      <div className="og-code__body" style={{ opacity: fade }}>
        <div className="og-code__scroll" style={{ transform: `translateY(${-scroll}px)` }}>
          <div className="og-code__gutter">
            {Array.from({ length: LINES }, (_, i) => (
              <span key={i} style={{ opacity: i < caretLine ? 1 : 0 }}>
                {i + 1}
              </span>
            ))}
          </div>
          <pre className="og-code__pre">
            {TOKENS.filter((tok) => tok.start < shown).map((tok) => (
              <span key={tok.start} className={`tok-${tok.kind}`}>
                {tok.text.slice(0, shown - tok.start)}
              </span>
            ))}
            <span className="og-code__caret" style={{ opacity: caretOn ? 1 : 0 }} />
          </pre>
        </div>
      </div>
    </div>
  );
}

/** The proof images' height in CSS px, and where each part of the message ends in them (proof.ts). */
const FULL = 319;
const REVEAL = REVEAL_FRACTIONS.map((f) => f * FULL);
const HEADER = REVEAL[0] ?? 0;
const FEATHER = FEATHER_FRACTION * FULL;
const REVEAL_MS = 380;

/** How far down block-kit's capture is revealed at time `t`. */
function revealedAt(t: number) {
  if (t < T_RESET || t >= T_SETTLE) return FULL;
  // The reset rolls the message back up to its header; then each block unrolls as it closes.
  if (t < T_TYPE) return FULL - easeInOut(progress(t, T_RESET, RESET)) * (FULL - HEADER);
  return BLOCK_TIMES.reduce(
    (h, start, i) =>
      h + easeOut(progress(t, start, REVEAL_MS)) * ((REVEAL[i + 1] ?? FULL) - (REVEAL[i] ?? FULL)),
    HEADER,
  );
}

/** How far down the diff scan has run at time `t`, 0 to 1; the badge counts with it. */
const scannedAt = (t: number) => easeInOut(progress(t, T_SCAN + SCAN_IN, SCAN_RUN));

function Stage({ t }: { t: number }) {
  const h = revealedAt(t);
  const mask = `linear-gradient(to bottom, #000 ${h}px, transparent ${h + FEATHER}px)`;

  // The wipe: the divider fades in at 70%, sweeps across to 20% and back. Slack's capture
  // is left of it, block-kit's right; they match, so only the divider moves.
  const comparing = t >= T_WIPE && t < T_SCAN;
  const sweep = Math.sin(easeInOut(progress(t, T_WIPE, WIPE)) * Math.PI);
  const at = comparing ? 70 - sweep * 50 : 100;
  const lineFade = Math.min(progress(t, T_WIPE, 300), 1 - progress(t, T_SCAN - 300, 300));

  // The scan: the pixel diff (red would mark a difference; there is none) replaces block-kit's
  // capture as a line runs down the message, then the message fades back.
  const scanning = t >= T_SCAN;
  const y = scannedAt(t) * FULL;
  const diffFade = scanning
    ? Math.min(
        progress(t, T_SCAN, SCAN_IN),
        1 - easeInOut(progress(t, DURATION - SCAN_OUT, SCAN_OUT)),
      )
    : 0;
  const scanLine = scanning
    ? Math.min(progress(t, T_SCAN, SCAN_IN), 1 - progress(t, T_SCAN + SCAN_IN + SCAN_RUN, 200))
    : 0;

  return (
    <div className="og-frame">
      <div className="og-stage">
        <div className="og-compare">
          <Img src={proofSlack} alt="" width={512} style={{ opacity: comparing ? 1 : 0 }} />
          <Img
            src={proofOurs}
            alt=""
            width={512}
            className="og-compare__over"
            style={{
              maskImage: mask,
              WebkitMaskImage: mask,
              clipPath: comparing ? `inset(0 0 0 ${at}%)` : "none",
            }}
          />
          {diffFade > 0 && (
            <Img
              src={proofDiff}
              alt=""
              width={512}
              className="og-compare__over"
              style={{ opacity: diffFade, clipPath: `inset(0 0 ${FULL - y}px 0)` }}
            />
          )}
          {scanLine > 0 && (
            <div className="og-scan" style={{ top: y, opacity: scanLine }}>
              <span className="og-scan__tag">0 px different</span>
            </div>
          )}
          {comparing && (
            <div className="og-divider" style={{ left: `${at}%`, opacity: lineFade }}>
              <span className="og-divider__handle" />
              <span className="og-divider__tag og-divider__tag--l">&larr; Slack</span>
              <span className="og-divider__tag og-divider__tag--r">
                <Img src={logo} alt="" />
                block-kit &rarr;
              </span>
            </div>
          )}
        </div>
      </div>
      <Badge t={t} />
    </div>
  );
}

function Badge({ t }: { t: number }) {
  // Full on the finished card; it leaves with the reset and returns to count along with the scan.
  const counting = t >= T_SCAN;
  const n = counting ? Math.round(scannedAt(t) * PIXELS) : PIXELS;
  const opacity = counting
    ? easeOut(progress(t, T_SCAN + 100, 300))
    : 1 - progress(t, T_RESET, 300);
  return (
    <div className="og-badge" style={{ opacity, transform: `translateY(${(1 - opacity) * 6}px)` }}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="8" fill="#007a5a" />
        <path
          d="M4.5 8.2l2.3 2.3 4.7-4.8"
          stroke="#fff"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        <b>{n.toLocaleString("en-US")}</b> of {PIXELS.toLocaleString("en-US")} pixels match Slack
      </span>
    </div>
  );
}

/** Holds the first frame until the fonts are in and the captures decoded. */
function useAssetsReady() {
  const [handle] = useState(() => delayRender("Loading fonts and captures"));
  useEffect(() => {
    const images = [proofSlack, proofOurs, proofDiff, logo].map((src) => {
      const img = new Image();
      img.src = src;
      return img.decode();
    });
    const fonts = ['600 46px "Geist Variable"', '13px "Geist Mono Variable"'].map((font) =>
      document.fonts.load(font),
    );
    Promise.all([...images, ...fonts]).then(
      () => continueRender(handle),
      (error: unknown) => cancelRender(error),
    );
  }, [handle]);
}

export function OgCard() {
  useAssetsReady();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * 1000;

  return (
    <main className="og">
      <header className="og-top">
        <span className="og-brand">
          <Img src={logo} alt="" />
          block-kit
        </span>
        <span className="og-url">block-kit.dev</span>
      </header>
      <h1 className="og-headline">{headline}</h1>
      <div className="og-panels">
        <Code t={t} />
        <Stage t={t} />
      </div>
    </main>
  );
}
