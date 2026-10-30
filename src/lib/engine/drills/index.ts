import type { DrillTask } from '../../types';
import { WRITE } from './write';
import { THINK } from './think';
import { DATA } from './data';
import { TALK } from './talk';
import { ENGLISH } from './english';
import { SELF } from './self';

/** every built-in task, written and checked by hand: 12 practice + 3 measurement per skill */
export const BUILTIN_TASKS: DrillTask[] = [...WRITE, ...THINK, ...DATA, ...TALK, ...ENGLISH, ...SELF];
