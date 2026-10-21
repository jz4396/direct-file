import { act, cleanup, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import GlobalLayout from '../components/GlobalLayout.js';
import { initI18n } from '../i18n.js';
import { enLocale, esLocale } from '../locales/featureLocales.js';
import { setupStore } from '../redux/store.js';
import { IRS_LOGO_FILES, OFFICIAL_SITE_STRINGS } from './checkStaticBundle.js';

const renderLayout = () =>
  render(
    <Provider store={setupStore()}>
      <MemoryRouter initialEntries={[`/home`]}>
        <GlobalLayout>
          <p>page</p>
        </GlobalLayout>
      </MemoryRouter>
    </Provider>
  );

const logoImages = (container: HTMLElement) =>
  [...container.querySelectorAll(`img`)].filter((img) =>
    IRS_LOGO_FILES.some((f) => (img.getAttribute(`src`) ?? ``).endsWith(f))
  );

describe(`static client-only build branding`, () => {
  beforeAll(async () => {
    await initI18n();
  });
  afterEach(async () => {
    cleanup();
    vi.unstubAllEnvs();
    await act(() => i18next.changeLanguage(`en`));
  });

  it(`shows the unofficial-preview banner instead of the government banner, logos and agency footer`, async () => {
    vi.stubEnv(`VITE_STATIC_CLIENT_ONLY`, `true`);
    const { container } = renderLayout();
    const banner = screen.getByTestId(`static-client-banner`);
    expect(banner).toHaveTextContent(enLocale.staticClient.banner.heading);
    expect(banner).toHaveTextContent(enLocale.staticClient.banner.body);
    // No close control: the notice can't be dismissed.
    expect(banner.querySelector(`button`)).toBeNull();
    for (const s of OFFICIAL_SITE_STRINGS) expect(container.textContent).not.toContain(s);
    expect(container.querySelector(`.usa-banner`)).toBeNull();
    expect(container.querySelector(`footer`)).toBeNull();
    expect(logoImages(container)).toEqual([]);
    expect(screen.getByRole(`link`, { name: enLocale.staticClient.homeLinkText })).toBeInTheDocument();
  });

  it(`shows the banner in Spanish`, async () => {
    vi.stubEnv(`VITE_STATIC_CLIENT_ONLY`, `true`);
    await act(() => i18next.changeLanguage(`es-US`));
    renderLayout();
    const banner = screen.getByTestId(`static-client-banner`);
    expect(banner).toHaveTextContent(esLocale.staticClient.banner.heading);
    expect(banner).toHaveTextContent(esLocale.staticClient.banner.body);
  });

  it(`leaves the regular build's government banner, IRS logos and footer unchanged`, () => {
    const { container } = renderLayout();
    expect(screen.queryByTestId(`static-client-banner`)).toBeNull();
    expect(container.textContent).toContain(OFFICIAL_SITE_STRINGS[0]);
    expect(container.querySelector(`footer`)).not.toBeNull();
    expect(logoImages(container).map((img) => img.getAttribute(`src`)?.split(`/`).pop())).toEqual([
      `irs-df-logo.svg`,
      `irs_logo_bk.svg`,
    ]);
  });
});
