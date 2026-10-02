import { describe, expect, it } from 'vitest';
import { classifyCode, modelHint, normalizeCode } from '../shared/codes.js';

describe('shared code rules', () => {
  it('normalizes scanner prefixes and separators without stripping letters', () => {
    expect(normalizeCode(' S/N: 231-akd 8r 7304 ')).toBe('231AKD8R7304');
    expect(normalizeCode('SN:P 6532-00096047')).toBe('P653200096047');
  });

  it('classifies serials, assets, and invalid input', () => {
    expect(classifyCode('231AKD8R7304')).toEqual({ type: 'serial', value: '231AKD8R7304' });
    expect(classifyCode('60001973')).toEqual({ type: 'asset', value: '60001973' });
    expect(classifyCode('12345')).toEqual({ type: 'invalid', value: '12345' });
  });

  it('provides a T6 hint without blocking mismatches', () => {
    expect(modelHint('P653200096047')).toBe('T6');
    expect(modelHint('231AKD8R7304')).toBeNull();
  });
});