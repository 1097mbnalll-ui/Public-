// Someone else scores your answer, with no server: the task, the criteria and your answer travel
// inside a link (compressed). The reviewer opens it in any browser, scores each criterion, and gets
// a reply link to send back; opening that adds their marks to your attempt.

import type { DrillTask, Mark } from './types';
import { packLinkPack, unpackLinkPack } from './transfer';
import { isNative, SITE_URL } from './native';

export interface ReviewAsk {
  v: 1;
  /** the attempt it belongs to (on the asker's device) */
  a: string;
  from?: string;
  t: Pick<DrillTask, 'title' | 'situation' | 'ask' | 'criteria' | 'exemplar'> & { en?: boolean };
  ans: string;
}

export interface ReviewBack {
  v: 1;
  a: string;
  name: string;
  scores: Record<string, Mark>;
  note?: string;
}

const base = () => (isNative() ? SITE_URL : location.href.split('#')[0]);

export async function reviewLink(ask: ReviewAsk): Promise<string> {
  return `${base()}#/review?d=${await packLinkPack(ask)}`;
}

export async function backLink(back: ReviewBack): Promise<string> {
  return `${base()}#/review-back?d=${await packLinkPack(back)}`;
}

export async function readAsk(d: string): Promise<ReviewAsk> {
  const x = (await unpackLinkPack(d)) as ReviewAsk;
  if (!x || x.v !== 1 || typeof x.a !== 'string' || !Array.isArray(x.t?.criteria) || typeof x.ans !== 'string') throw new Error('bad');
  return x;
}

export async function readBack(d: string): Promise<ReviewBack> {
  const x = (await unpackLinkPack(d)) as ReviewBack;
  if (!x || x.v !== 1 || typeof x.a !== 'string' || !x.scores || typeof x.scores !== 'object') throw new Error('bad');
  for (const k of Object.keys(x.scores)) if (![0, 1, 2].includes(x.scores[k])) throw new Error('bad');
  return x;
}

/** share a link: the phone's share sheet when there is one, otherwise copy */
export async function shareLink(url: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ text, url });
      return 'shared';
    }
  } catch {
    /* cancelled or blocked: fall back to copying */
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
