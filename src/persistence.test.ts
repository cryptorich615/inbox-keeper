import { describe, expect, it } from 'vitest';
import { defaultState, effectiveTheme, loadState, saveState, STORAGE_KEY } from './persistence';

describe('versioned local persistence', () => {
  it('falls back safely for corrupted or unknown data', () => {
    expect(loadState({getItem:()=>'{bad'})).toEqual(defaultState());
    expect(loadState({getItem:()=>JSON.stringify({version:99, emails:[]})})).toEqual(defaultState());
    expect(loadState({getItem:()=>JSON.stringify({...defaultState(), emails:[{id:'broken'}]})})).toEqual(defaultState());
  });
  it('saves and restores supported state', () => {
    const data = defaultState(); const values = new Map<string,string>();
    expect(saveState({...data,theme:'dark'}, {setItem:(k,v)=>void values.set(k,v)})).toBe(true);
    expect(loadState({getItem:k=>values.get(k)??null}).theme).toBe('dark');
    expect(values.has(STORAGE_KEY)).toBe(true);
  });
  it('fails closed when storage quota is unavailable', () => {
    expect(saveState(defaultState(), {setItem:()=>{throw new Error('quota')}})).toBe(false);
  });
  it('resolves system theme without overwriting the preference', () => {
    expect(effectiveTheme('system', true)).toBe('dark');
    expect(effectiveTheme('system', false)).toBe('light');
  });
});
