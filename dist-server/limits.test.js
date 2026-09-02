import { describe, expect, it } from 'vitest';
import { retryDelay, SlidingLimit } from './limits.js';
describe('limits', () => { it('limits requests', () => { const l = new SlidingLimit(1, 1000); l.check('u'); expect(() => l.check('u')).toThrow(/limit/); }); it('uses bounded exponential jitter', () => { expect(retryDelay(3, 100, 1000, () => 0)).toBe(600); expect(retryDelay(9, 100, 1000, () => 1)).toBe(1250); }); });
