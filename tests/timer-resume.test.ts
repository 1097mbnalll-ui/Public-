import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../src/lib/actions';
import { getState, replaceState } from '../src/lib/store';
import { initialState } from '../src/lib/defaults';

describe('starting the same session again', () => {
  beforeEach(() => replaceState(initialState()));
  const plan = { total: 120, work: 25, brk: 5, parts: [{ label: 'إحصاء', minutes: 60 }, { label: 'إنجليزي', minutes: 60 }] };
  it('goes back into it instead of starting over', () => {
    A.startTimer({ kind: 'study', refId: 'e1', label: 'جلسة', plan });
    getState().timer!.acc = 70 * 60000;
    A.pauseTimer();
    A.setFocus(false);
    A.startTimer({ kind: 'study', refId: 'e1', label: 'جلسة', plan });
    const t = getState().timer!;
    expect(A.timerElapsed(t)).toBeGreaterThanOrEqual(70 * 60000);
    expect(t.running && t.focus).toBe(true);
  });
  it('the adhan pauses it as of the adhan', () => {
    A.startTimer({ kind: 'study', refId: 'e1', label: 'جلسة' });
    const t0 = getState().timer!.startedAt;
    A.pauseTimerAt(t0 + 5 * 60000);
    expect(getState().timer!.running).toBe(false);
  });
});
