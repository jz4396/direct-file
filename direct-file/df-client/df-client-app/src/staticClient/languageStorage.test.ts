import { afterEach, describe, expect, it } from 'vitest';
import { commonInitI18n } from 'df-i18n';

/**
 * The static client-only build writes nothing to browser storage unless the user saves their return (#132), so it
 * initializes i18n with `persistLanguage: false` (i18n.tsx). The regular build still remembers the language.
 */
describe(`language preference storage`, () => {
  afterEach(() => localStorage.clear());

  it(`is not written when persistLanguage is false`, async () => {
    localStorage.clear();
    await commonInitI18n({ en: { translation: {} } }, { persistLanguage: false });
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it(`is remembered by default`, async () => {
    localStorage.clear();
    await commonInitI18n({ en: { translation: {} } });
    expect(localStorage.getItem(`irs_df_language`)).toBe(`en`);
  });
});
