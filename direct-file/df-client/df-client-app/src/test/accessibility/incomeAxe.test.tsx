import { act, cleanup, render } from '@testing-library/react';
import axe from 'axe-core';
import { initI18n } from '../../i18n.js';
import Screen from '../../components/Screen.js';
import { AllScreensContext, uuid } from '../../all-screens/AllScreensContext.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import { ScreenConfig } from '../../flow/ScreenConfig.js';
import '@trussworks/react-uswds/lib/index.css';

// axe-core 4.14 exposes run on the default export. A named import of run is not callable.
// eslint-disable-next-line import/no-named-as-default-member
const runAxe = axe.run.bind(axe);

/**
 * WCAG 2.1 A and AA on every Income screen, in English and Spanish.
 *
 * axe runs with the WCAG tags only. No rule is disabled: page-shell criteria (html lang, a document
 * title, and a skip link into main) are set up here the same way GlobalLayout provides them.
 * Mutually exclusive headings share the all-screens render; each user-facing screen shows one of them,
 * and extra headings use their own ids so duplicate-id still has to pass.
 */

const flow = createFlowConfig(flowNodes);
const incomeScreens = flow.screens.filter((s) => s.categoryRoute === `/flow/income`);
const WCAG_TAGS = [`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className='usa-skipnav' href='#main'>
        Skip to main content
      </a>
      <main id='main'>{children}</main>
    </>
  );
}

async function renderScreen(config: ScreenConfig) {
  await act(async () => {
    render(
      <Shell>
        <AllScreensContext>
          <Screen
            screenRoute={config.route}
            collectionId={uuid}
            screenContent={config.content}
            setFactActionPaths={[]}
            gotoNextScreen={() => undefined}
            alertAggregatorType={config.alertAggregatorType}
            collectionContext={config.collectionContext}
          />
        </AllScreensContext>
      </Shell>
    );
  });
}

describe(`Income screens: axe WCAG 2.1 A/AA`, () => {
  beforeAll(async () => {
    await initI18n();
    Element.prototype.scrollIntoView = () => undefined;
  });
  afterEach(cleanup);

  it(`covers the Income section`, () => {
    expect(incomeScreens.length).toBeGreaterThan(200);
  });

  describe.each([
    [`en`, `en`],
    [`es`, `es-US`],
  ])(`%s`, (label, language) => {
    beforeAll(async () => {
      const i18n = await initI18n();
      await i18n.changeLanguage(language);
      if (label === `es`) {
        expect(i18n.t(`formBoxGroups.w2`)).toBe(`Formulario W-2`);
      }
      document.documentElement.lang = language === `es-US` ? `es` : language;
      document.title = label === `es` ? `Ingresos` : `Income`;
    });

    it.each(incomeScreens.map((s) => [s.route, s] as const))(
      `%s`,
      async (_route, config) => {
        await renderScreen(config);
        const results = await runAxe(document, {
          runOnly: { type: `tag`, values: WCAG_TAGS },
        });
        const violations = results.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.slice(0, 3).map((node) => node.target.join(` `)),
        }));
        expect(violations).toEqual([]);
      },
      20000
    );
  });
});
