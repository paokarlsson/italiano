import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserText } from '../models/leggi.models';
import { AiResult, AiService } from './ai.service';
import { AiError } from './ai-text';

const result = (id: string): AiResult => ({
  text: { id } as UserText,
  cost: 0.1,
  missing: [],
  faithful: true,
});

describe('AiService.writeSeries', () => {
  let ai: AiService;
  /** Det varje text beställdes med, och om tjänsten räknades som upptagen under tiden. */
  let calls: { follow: boolean; label: string; busyBetween: boolean }[];

  beforeEach(() => {
    TestBed.configureTestingModule({});
    ai = TestBed.inject(AiService);
    calls = [];
  });

  const stubWrite = (fail: number | null = null) =>
    vi.spyOn(ai, 'write').mockImplementation(async (_topic, follow = true, label = '') => {
      calls.push({ follow, label, busyBetween: ai.busy() });
      await Promise.resolve();
      if (calls.length === fail) throw new AiError('rate-limit', 'För många anrop just nu.');
      return result(`ai-${calls.length}`);
    });

  it('skriver texterna i följd, och låter dem fortsätta på varandra', async () => {
    stubWrite();
    const { results, error } = await ai.writeSeries('en resa', false, 3);
    expect(error).toBeNull();
    expect(results.map((r) => r.text.id)).toEqual(['ai-1', 'ai-2', 'ai-3']);
    // Den första börjar en ny berättelse, som läsaren bad om; resten fortsätter på den.
    expect(calls.map((c) => c.follow)).toEqual([false, true, true]);
    expect(calls.map((c) => c.label)).toEqual([
      'Text 1 av 3 · ',
      'Text 2 av 3 · ',
      'Text 3 av 3 · ',
    ]);
  });

  it('räknas som upptagen hela serien igenom, så att påfyllningen väntar', async () => {
    stubWrite();
    const pending = ai.writeSeries('', true, 2);
    expect(ai.busy()).toBe(true);
    await pending;
    expect(calls.every((c) => c.busyBetween)).toBe(true);
    expect(ai.busy()).toBe(false);
  });

  it('behåller det som hann skrivas när en text i serien går fel', async () => {
    stubWrite(3);
    const { results, error } = await ai.writeSeries('', true, 5);
    expect(results.map((r) => r.text.id)).toEqual(['ai-1', 'ai-2']);
    expect(error?.message).toBe('För många anrop just nu.');
    expect(calls.length).toBe(3);
    expect(ai.busy()).toBe(false);
  });

  it('kastar felet när inte ens den första texten blev skriven', async () => {
    stubWrite(1);
    await expect(ai.writeSeries('', true, 3)).rejects.toThrow('För många anrop just nu.');
    expect(ai.busy()).toBe(false);
  });

  it('skriver en enda text utan räknare i statusraden', async () => {
    stubWrite();
    await ai.writeSeries('', true, 1);
    expect(calls).toEqual([{ follow: true, label: '', busyBetween: true }]);
  });
});
