import { describe, expect, it } from 'vitest';
import { calculateBiorhythm } from '../biorhythm';
import { analysisCacheKey } from '../analysisCache';

describe('日本時間のバイオリズム', () => {
  it('JST午前9時をまたいでも日次値とキャッシュキーを保つ', async () => {
    const before = new Date('2026-11-05T23:59:59Z');
    const after = new Date('2026-11-06T00:00:00Z');
    const userProfile = { birthDate: '1990-04-01' };
    const first = calculateBiorhythm(userProfile.birthDate, before);
    const second = calculateBiorhythm(userProfile.birthDate, after);
    expect(first).toEqual(second);
    expect(await analysisCacheKey({ userProfile, biorhythm: first }, before))
      .toBe(await analysisCacheKey({ userProfile, biorhythm: second }, after));
  });

  it('JST0時に切替わり、うるう日を暦日として数える', () => {
    const birth = '2024-02-29';
    expect(calculateBiorhythm(birth, new Date('2024-02-29T14:59:59Z'))).toEqual({ p: 0, e: 0, i: 0 });
    expect(calculateBiorhythm(birth, new Date('2024-02-29T15:00:00Z'))).toEqual({
      p: Math.round(Math.sin(2 * Math.PI / 23) * 100),
      e: Math.round(Math.sin(2 * Math.PI / 28) * 100),
      i: Math.round(Math.sin(2 * Math.PI / 33) * 100),
    });
  });
  it('実行端末のtimezoneが変わっても同じJST日の値を返す', () => {
    const previous = process.env.TZ;
    try {
      const now = new Date('2026-11-05T16:00:00Z');
      process.env.TZ = 'Pacific/Honolulu';
      const first = calculateBiorhythm('1990-04-01', now);
      process.env.TZ = 'Asia/Tokyo';
      expect(calculateBiorhythm('1990-04-01', now)).toEqual(first);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

});
