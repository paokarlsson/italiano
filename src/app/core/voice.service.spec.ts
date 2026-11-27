import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceService } from './voice.service';

/** ElevenLabs i minnet: rösterna, modellerna, kontot och inläsningen. */
function fakeApi(opts: { voices?: string[]; subscription?: number } = {}) {
  const calls: { url: string; body?: unknown }[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const path = new URL(url).pathname;
      if (path === '/v1/voices') {
        return json({
          voices: (opts.voices ?? ['Rachel', 'Samanta – Italian', 'Daniele']).map((name, i) => ({
            voice_id: `v${i}`,
            name,
          })),
        });
      }
      if (path === '/v1/models') {
        return json([
          {
            model_id: 'eleven_flash_v2_5',
            name: 'Flash',
            can_do_text_to_speech: true,
            languages: [{ language_id: 'it' }],
            model_rates: { character_cost_multiplier: 0.5 },
          },
          { model_id: 'en', name: 'English', can_do_text_to_speech: true, languages: [] },
        ]);
      }
      if (path === '/v1/user/subscription') {
        return opts.subscription === undefined
          ? json({ detail: 'missing permission' }, 401)
          : json({
              character_count: opts.subscription,
              character_limit: 100000,
              next_character_count_reset_unix: 1_800_000_000,
            });
      }
      if (path.startsWith('/v1/text-to-speech/')) return new Response(new Uint8Array([1, 2, 3]));
      return json({}, 404);
    }),
  );
  return calls;
}

describe('VoiceService', () => {
  let voice: VoiceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    voice = TestBed.inject(VoiceService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('väljer Samanta och Daniele om de finns, och bara modeller som kan italienska', async () => {
    fakeApi({ subscription: 1200 });
    await voice.saveKey('sk_test');
    expect(voice.voiceId('f')).toBe('v1');
    expect(voice.voiceId('m')).toBe('v2');
    expect(voice.models().map((m) => [m.id, m.rate])).toEqual([['eleven_flash_v2_5', 0.5]]);
    expect(voice.ready()).toBe(true);
    expect(voice.tag('m')).toBe('m:v2/eleven_flash_v2_5');
    expect(voice.account()).toEqual({ used: 1200, limit: 100000, resets: 1_800_000_000_000 });
  });

  it('väljer två olika röster när de önskade saknas', async () => {
    fakeApi({ voices: ['Rachel', 'Adam'] });
    await voice.saveKey('sk_test');
    expect([voice.voiceId('f'), voice.voiceId('m')].sort()).toEqual(['v0', 'v1']);
    // Kontot gick inte att läsa — då visas bara det som räknats härifrån.
    expect(voice.account()).toBeNull();
  });

  it('läser in med rätt röst och räknar krediterna med modellens pris', async () => {
    const calls = fakeApi();
    await voice.saveKey('sk_test');
    await voice.speak('Ciao!', 'm');
    await voice.speak('Buongiorno.', 'f');

    const tts = calls.filter((c) => c.url.includes('/text-to-speech/'));
    expect(tts.map((c) => new URL(c.url).pathname)).toEqual([
      '/v1/text-to-speech/v2',
      '/v1/text-to-speech/v1',
    ]);
    expect(tts[0].body).toEqual({
      text: 'Ciao!',
      model_id: 'eleven_flash_v2_5',
      language_code: 'it',
    });
    expect(voice.characters()).toBe(16);
    expect(voice.credits()).toBe(8);
    expect(voice.guessed()).toBe(false);
  });

  it('räknar en kredit per tecken, och säger det, när priset inte är känt', async () => {
    fakeApi();
    await voice.saveKey('sk_test');
    voice.setModel('okand_modell');
    await voice.speak('Ciao!', 'f');
    expect(voice.credits()).toBe(5);
    expect(voice.guessed()).toBe(true);
    voice.resetCount();
    expect([voice.characters(), voice.credits(), voice.guessed()]).toEqual([0, 0, false]);
  });
});
