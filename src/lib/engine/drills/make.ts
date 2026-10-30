import type { DrillTask, SkillId } from '../../types';

/** a built-in task in one line per field; criteria get ids c1, c2… in order */
export function task(
  id: string,
  skill: SkillId,
  level: number,
  title: string,
  situation: string,
  ask: string,
  criteria: string[],
  exemplar: string,
  why: string[],
  opts: { minutes?: number; kind?: DrillTask['kind']; benchmark?: boolean; en?: boolean } = {},
): DrillTask {
  return {
    id,
    skill,
    level,
    title,
    situation,
    ask,
    minutes: opts.minutes ?? 10,
    kind: opts.kind ?? 'text',
    criteria: criteria.map((text, i) => ({ id: `c${i + 1}`, text })),
    exemplar,
    why,
    source: 'builtin',
    ...(opts.benchmark ? { benchmark: true } : {}),
    ...(opts.en ? { en: true } : {}),
  };
}
