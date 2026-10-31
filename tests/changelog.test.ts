import { describe, expect, it } from 'vitest';
import { CHANGES, cmpVersion, releasesBetween, VERSION } from '../src/lib/changelog';

describe('versions', () => {
  it('compares part by part', () => {
    expect(cmpVersion('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(cmpVersion('1.4.2.2', '1.4.2')).toBeGreaterThan(0);
    expect(cmpVersion('1.4', '1.4.0')).toBe(0);
  });
  it('the list is newest first and the version is its head', () => {
    for (let i = 1; i < CHANGES.length; i++) expect(cmpVersion(CHANGES[i - 1].v, CHANGES[i].v)).toBeGreaterThan(0);
    expect(VERSION).toBe(CHANGES[0].v);
    expect(releasesBetween(CHANGES[2].v).map((r) => r.v)).toEqual([CHANGES[0].v, CHANGES[1].v]);
  });
});
