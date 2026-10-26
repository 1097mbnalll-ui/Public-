import { useId, type KeyboardEvent } from 'react';
import { PARTS, partName, type Part } from '../lib/engine/gym';
import { L } from '../lib/i18n';

// A body, front and back, drawn as its muscles. Each muscle is one shape on the left half and its
// mirror on the right. Colour says how much an exercise works it: strong = mainly, soft = also.
// When `onPart` is given, every muscle is a button.

type Side = 'front' | 'back';

/**
 * The left half of each view (an athletic build: wide shoulders, V-taper, full legs); the right half
 * is the same, mirrored. viewBox 0 0 220 474, the body's centre line at x = 110.
 */
const SHAPES: Record<Side, { part: Part; d: string }[]> = {
  front: [
    { part: 'traps', d: 'M101 66C94 74 80 80 66 83L92 87C98 81 103 75 105 72Z' },
    { part: 'side_delt', d: 'M62 84C48 86 38 98 36 112C35 122 38 130 44 136L46 134C46 120 48 104 58 92C62 88 66 86 70 85Z' },
    { part: 'front_delt', d: 'M68 86C57 92 49 104 47 118C46 126 46 130 46 134C54 128 60 118 68 110C76 102 84 95 93 90Z' },
    { part: 'chest', d: 'M108.5 90L94 90C81 94 71 104 67 114C64 124 68 134 76 140C86 146 100 147 108.5 143Z' },
    { part: 'biceps', d: 'M45 138C37 148 35 164 38 180C41 189 50 192 56 186C62 172 62 154 59 141C56 136 50 134 45 138Z' },
    { part: 'forearm', d: 'M41 191C35 205 31 225 29 250C29 256 32 260 36 258C42 240 48 220 54 199C52 191 47 187 41 191Z' },
    { part: 'forearm', d: 'M55 192C57 208 53 228 45 256L39 258C45 236 51 214 53 194Z' },
    { part: 'obliques', d: 'M75 145C71 157 70 177 74 196C77 208 83 216 90 223L92 207C88 191 87 171 89 151C85 147 80 145 75 145Z' },
    { part: 'abs', d: 'M108.5 147L93 149C90 171 90 201 93 223C97 236 103 244 108.5 248Z' },
    { part: 'adductors', d: 'M96 257C100 262 104 268 107 276L107 302C102 293 98 281 96 269Z' },
    { part: 'quads', d: 'M77 251C67 271 64 300 69 327C72 337 79 343 85 340C83 318 85 290 91 266Z' },
    { part: 'quads', d: 'M91 263C85 287 83 313 87 338C91 344 97 344 99 336C101 310 101 284 97 263Z' },
    { part: 'quads', d: 'M99 300C97 316 97 330 101 340C105 342 107 336 107 328C107 318 105 306 99 300Z' },
    { part: 'calves', d: 'M80 356C71 373 71 398 77 429L87 430C89 404 91 380 91 359Z' },
    { part: 'calves', d: 'M93 359C95 381 95 405 93 430L99 430C101 404 101 378 99 359Z' },
  ],
  back: [
    { part: 'traps', d: 'M109.5 58L102 62C98 72 84 80 66 84C80 90 92 104 100 124C104 136 107 146 109.5 152Z' },
    { part: 'side_delt', d: 'M62 84C48 86 38 98 36 112C35 122 38 130 44 136L46 134C46 120 48 104 58 92C62 88 66 86 70 85Z' },
    { part: 'rear_delt', d: 'M67 86C57 91 49 103 47 117C46 126 46 131 46 135C52 125 58 114 66 106C72 100 80 96 86 92Z' },
    { part: 'upper_back', d: 'M87 94C79 100 73 110 71 120C79 124 89 126 99 124C97 114 95 104 91 96Z' },
    { part: 'lats', d: 'M69 125C65 143 67 167 75 187C81 201 89 211 97 215C99 197 101 177 104 161C101 147 99 137 97 129C89 129 79 129 69 125Z' },
    { part: 'lower_back', d: 'M108.5 157C104 169 101 183 99 197C97 209 97 221 99 233L108.5 235Z' },
    { part: 'triceps', d: 'M43 137C36 150 36 168 39 182C44 190 54 190 58 183C61 168 61 152 57 139C54 134 48 134 43 137Z' },
    { part: 'forearm', d: 'M41 191C35 205 31 225 29 250C29 256 32 260 36 258C42 240 48 220 54 199C52 191 47 187 41 191Z' },
    { part: 'forearm', d: 'M55 192C57 208 53 228 45 256L39 258C45 236 51 214 53 194Z' },
    { part: 'glutes', d: 'M108.5 240C96 236 82 238 74 248C68 260 70 276 80 284C90 290 102 288 108.5 282Z' },
    { part: 'hamstrings', d: 'M77 290C71 306 71 326 75 340C81 346 89 346 93 340C95 322 95 306 93 292Z' },
    { part: 'hamstrings', d: 'M95 292C99 306 101 322 99 340C103 344 107 340 107 330C107 314 105 300 101 290Z' },
    { part: 'calves', d: 'M80 355C69 369 69 391 77 405C82 411 89 409 91 402C93 388 93 370 91 358Z' },
    { part: 'calves', d: 'M93 356C99 366 101 382 99 400C97 408 93 410 93 402C93 388 93 372 93 356Z' },
    { part: 'calves', d: 'M81 405C81 420 83 432 87 436L95 436C97 426 97 414 97 404Z' },
  ],
};

/** the body behind the muscles (left half) */
const BODY =
  'M110 72L100 72C96 78 84 80 68 82C50 84 37 94 34 110C32 124 35 134 37 142C32 158 32 174 35 186C30 204 25 228 23 252C21 268 21 284 25 294C29 300 37 298 39 290C39 280 39 270 40 262C46 240 54 216 58 196C60 180 60 164 61 150C64 162 68 176 70 194C72 212 72 226 70 240C65 260 61 290 63 320C65 336 69 346 73 354C67 374 67 400 73 432C74 444 72 454 70 462C74 470 92 470 96 464C96 452 96 442 98 432C102 404 104 378 102 356C104 344 106 330 106 316C108 296 108 280 110 270Z';

/** the lines inside muscles that make it read as a body (abs, sternum, spine, shoulder blades) */
const DETAIL: Record<Side, string> = {
  front: 'M110 92V246M93 168C98 166 104 167 109 168M93 190C98 188 104 189 109 190M93 211C98 209 104 210 109 211M80 150L88 153M78 162L88 164M77 174L88 175M68 116C80 124 96 128 108 128',
  back: 'M110 64V238M100 126C94 130 88 138 84 148M66 106C72 112 80 116 92 116M76 270C86 266 98 266 108 270',
};

function Figure({ side, main, also, picked, onPart, label }: { side: Side; main?: Set<Part>; also?: Set<Part>; picked?: Set<Part>; onPart?: (p: Part) => void; label: string }) {
  const uid = useId().replace(/:/g, '');
  const tone = (p: Part) => (picked?.has(p) ? 'pick' : main?.has(p) ? 'main' : also?.has(p) ? 'also' : '');
  // each muscle is lit on its own — light in the middle, darker to its edges — so it reads as sculpted
  const fill = (t: string) => `url(#${uid}-${t === 'pick' ? 'main' : t || 'base'})`;
  const key = (p: Part) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPart?.(p);
    }
  };
  const half = (mirror: boolean) => (
    <g transform={mirror ? 'translate(220 0) scale(-1 1)' : undefined} filter={`url(#${uid}-depth)`}>
      <path d={BODY} className="bm-body" fill={`url(#${uid}-skin)`} />
      {SHAPES[side].map(({ part, d }) => (
        <path
          key={part}
          d={d}
          className={`bm-m ${tone(part)}`}
          fill={fill(tone(part))}
          {...(onPart && !mirror
            ? { role: 'button', tabIndex: 0, 'aria-label': partName(part), 'aria-pressed': !!picked?.has(part), onClick: () => onPart(part), onKeyDown: key(part) }
            : onPart
              ? { onClick: () => onPart(part), 'aria-hidden': true }
              : {})}
        >
          <title>{partName(part)}</title>
        </path>
      ))}
    </g>
  );
  return (
    <figure className="bm-fig">
      <svg viewBox="0 0 220 474" role={onPart ? 'group' : 'img'} aria-label={label}>
        <defs>
          {['base', 'main', 'also', 'skin'].map((t) => (
            <radialGradient key={t} id={`${uid}-${t}`} cx="42%" cy="34%" r="78%">
              <stop offset="0%" className={`bm-s ${t} hi`} />
              <stop offset="55%" className={`bm-s ${t} mid`} />
              <stop offset="100%" className={`bm-s ${t} lo`} />
            </radialGradient>
          ))}
          <filter id={`${uid}-depth`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="0.8" floodOpacity="0.28" />
          </filter>
        </defs>
        <path className="bm-body" fill={`url(#${uid}-skin)`} d="M96 52C96 62 95 70 92 76L128 76C125 70 124 62 124 52Z" />
        <ellipse cx="110" cy="34" rx="19" ry="25" className="bm-body" fill={`url(#${uid}-skin)`} />
        {half(false)}
        {half(true)}
        <g className="bm-lines" aria-hidden>
          <path d={DETAIL[side]} />
          <path d={DETAIL[side]} transform="translate(220 0) scale(-1 1)" />
        </g>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function BodyMap({ main, also, picked, onPart, size = 'md', only }: { main?: Set<Part>; also?: Set<Part>; picked?: Set<Part>; onPart?: (p: Part) => void; size?: 'xs' | 'sm' | 'md' | 'lg'; only?: Side }) {
  return (
    <div className={`bm bm-${size} ${onPart ? 'live' : ''}`}>
      {only !== 'back' && <Figure side="front" main={main} also={also} picked={picked} onPart={onPart} label={L('أمام', 'Front')} />}
      {only !== 'front' && <Figure side="back" main={main} also={also} picked={picked} onPart={onPart} label={L('خلف', 'Back')} />}
    </div>
  );
}

/** which view shows a muscle best */
export const sideOf = (p?: Part): Side => (PARTS.find((x) => x.id === p)?.side === 'back' ? 'back' : 'front');

/** the colours, in words */
export function BodyLegend({ main, also }: { main: Set<Part>; also: Set<Part> }) {
  if (!main.size && !also.size) return null;
  return (
    <div className="bm-legend">
      {main.size > 0 && <div><i className="k-main" /><span><b>{L('أساسي:', 'Mainly:')}</b> {[...main].map(partName).join(L('، ', ', '))}</span></div>}
      {also.size > 0 && <div><i className="k-also" /><span><b>{L('يساعد:', 'Also:')}</b> {[...also].map(partName).join(L('، ', ', '))}</span></div>}
    </div>
  );
}
