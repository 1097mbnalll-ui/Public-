// The timer in a small floating window over other apps, so a lesson video and the clock can share
// the screen. In the Android app: the system's picture-in-picture (the whole app shrinks, and it
// does so by itself when you leave with a timer running). On the web: Document Picture-in-Picture
// where the browser has it (Chrome/Edge on a computer), otherwise a «video» window drawn from a
// canvas (phones), which the browser floats over everything.

import { registerPlugin } from '@capacitor/core';
import { isNative } from './native';

interface PipNative {
  isSupported(): Promise<{ supported: boolean }>;
  enter(): Promise<{ ok: boolean }>;
  setAuto(o: { on: boolean }): Promise<void>;
  addListener(ev: 'pipChange', fn: (e: { inPip: boolean }) => void): Promise<unknown>;
}
const Native = registerPlugin<PipNative>('MadarPip');

type State = { inPip: boolean; win: Window | null; video: HTMLVideoElement | null };
let state: State = { inPip: false, win: null, video: null };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const pipState = () => state;
export const pipSubscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

let nativeOk = false;
export async function startPip() {
  if (!isNative()) return;
  try {
    nativeOk = (await Native.isSupported()).supported;
    await Native.addListener('pipChange', (e) => set({ inPip: e.inPip }));
  } catch {
    nativeOk = false;
  }
}

/** can this device float the timer at all */
export function pipSupported(): boolean {
  if (isNative()) return nativeOk;
  const v = document.createElement('video') as HTMLVideoElement & { webkitSupportsPresentationMode?: (m: string) => boolean };
  return 'documentPictureInPicture' in window || (!!document.pictureInPictureEnabled && 'captureStream' in HTMLCanvasElement.prototype) || !!v.webkitSupportsPresentationMode?.('picture-in-picture');
}

/** in the app: shrink into the floating window by itself when you leave with a timer running */
export function setAutoPip(on: boolean) {
  if (isNative() && nativeOk) void Native.setAuto({ on }).catch(() => {});
}

/** draws one frame of the floating clock (the canvas fallback) */
export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export async function openPip(paint: Painter, onPlayPause?: (play: boolean) => void): Promise<boolean> {
  if (isNative()) {
    try {
      return (await Native.enter()).ok;
    } catch {
      return false;
    }
  }
  const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window> } }).documentPictureInPicture;
  if (dpip) {
    try {
      const w = await dpip.requestWindow({ width: 280, height: 260 });
      // the page's look inside the little window
      for (const sheet of [...document.styleSheets]) {
        try {
          const css = [...sheet.cssRules].map((r) => r.cssText).join('\n');
          const st = w.document.createElement('style');
          st.textContent = css;
          w.document.head.appendChild(st);
        } catch {
          if (sheet.href) {
            const l = w.document.createElement('link');
            l.rel = 'stylesheet';
            l.href = sheet.href;
            w.document.head.appendChild(l);
          }
        }
      }
      w.document.documentElement.dir = document.documentElement.dir;
      w.document.documentElement.lang = document.documentElement.lang;
      w.document.documentElement.className = document.documentElement.className;
      for (const a of document.documentElement.getAttributeNames()) if (a.startsWith('data-')) w.document.documentElement.setAttribute(a, document.documentElement.getAttribute(a)!);
      w.document.title = document.title;
      w.addEventListener('pagehide', () => set({ win: null }));
      set({ win: w });
      return true;
    } catch {
      /* fall through to the video window */
    }
  }
  return openVideoPip(paint, onPlayPause);
}

let painter: ReturnType<typeof setInterval> | null = null;

/** phones: a canvas drawn every half second, streamed into a video the browser can float */
async function openVideoPip(paint: Painter, onPlayPause?: (play: boolean) => void): Promise<boolean> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;
    const draw = () => paint(ctx, canvas.width, canvas.height);
    draw();
    const video = document.createElement('video') as HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void; webkitSupportsPresentationMode?: (m: string) => boolean };
    video.muted = true;
    video.playsInline = true;
    video.srcObject = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(4);
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0';
    document.body.appendChild(video);
    await video.play();
    if (painter) clearInterval(painter);
    painter = setInterval(draw, 500);
    const close = () => {
      if (painter) clearInterval(painter);
      painter = null;
      video.remove();
      set({ video: null });
    };
    video.addEventListener('leavepictureinpicture', close);
    // the window's play / pause button pauses and resumes the timer
    if (onPlayPause) {
      video.addEventListener('pause', () => state.video && onPlayPause(false));
      video.addEventListener('play', () => state.video && onPlayPause(true));
      try {
        navigator.mediaSession.setActionHandler('pause', () => onPlayPause(false));
        navigator.mediaSession.setActionHandler('play', () => onPlayPause(true));
      } catch {
        /* not every browser has media session */
      }
    }
    if (video.requestPictureInPicture && document.pictureInPictureEnabled) await video.requestPictureInPicture();
    else if (video.webkitSupportsPresentationMode?.('picture-in-picture')) {
      video.webkitSetPresentationMode!('picture-in-picture');
      video.addEventListener('webkitpresentationmodechanged', () => (video as unknown as { webkitPresentationMode: string }).webkitPresentationMode !== 'picture-in-picture' && close());
    } else {
      close();
      return false;
    }
    set({ video });
    return true;
  } catch {
    return false;
  }
}

export function closePip() {
  state.win?.close();
  if (state.video) {
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    state.video.remove();
  }
  if (painter) clearInterval(painter);
  painter = null;
  set({ win: null, video: null });
}
