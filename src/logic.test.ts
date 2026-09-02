import { describe, expect, it } from 'vitest';
import { applyFilters, safeTrashIds } from './logic';
import { sampleEmails } from './data';
import type { Filters } from './types';

describe('cleanup safety logic', () => {
  it('always excludes protected senders and domains', () => {
    const selected = new Set(sampleEmails.map(e => e.id));
    const safe = safeTrashIds(sampleEmails, selected, new Set(['alerts@mybank.example']), new Set(['family.example']), 0);
    expect(safe.has('7')).toBe(false);
    expect(safe.has('8')).toBe(false);
    expect(safe.has('9')).toBe(false);
    expect(safe.has('1')).toBe(true);
  });

  it('keeps the newest N messages for each selected sender', () => {
    const selected = new Set(['1','2','3']);
    const safe = safeTrashIds(sampleEmails, selected, new Set(), new Set(), 1);
    expect([...safe]).toEqual(expect.arrayContaining(['2','3']));
    expect(safe.has('1')).toBe(false);
  });
});

describe('filtering', () => {
  const defaults: Filters = { search:'', read:'all', starred:false, attachment:false, category:'All', age:'all' };
  it('combines sender search, unread, and category filters', () => {
    const result = applyFilters(sampleEmails, {...defaults, search:'ShopDrop', read:'unread', category:'Promotions'});
    expect(result.map(e => e.id)).toEqual(['4']);
  });

  it('filters attachments and starred messages', () => {
    const result = applyFilters(sampleEmails, {...defaults, starred:true, attachment:true});
    expect(result.map(e => e.id)).toEqual(expect.arrayContaining(['7','9']));
    expect(result.every(e => e.starred && e.attachment)).toBe(true);
  });
});
