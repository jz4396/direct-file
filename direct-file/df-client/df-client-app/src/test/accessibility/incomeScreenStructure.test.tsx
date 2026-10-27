import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { initI18n } from '../../i18n.js';
import Screen from '../../components/Screen.js';
import { AllScreensContext, uuid } from '../../all-screens/AllScreensContext.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import { ScreenConfig } from '../../flow/ScreenConfig.js';

/**
 * Structure of every screen in the Income section, rendered as in the all-screens view (every conditional block
 * shown, so a screen is checked with all of its optional content):
 *
 * - WCAG 2.1 SC 1.3.1 (Info and Relationships) and 2.4.6 (Headings and Labels): after the page's h1, heading levels
 *   only go down one step at a time (no h1 -> h3), so the outline a screen reader lists is complete.
 * - SC 3.3.2 (Labels or Instructions): no empty `.usa-hint`, every `aria-describedby` id points at an element with
 *   text, and every `<label for>` points at an element on the page.
 * - Ids carry no `*` (from an abstract collection path such as `/formW2s/*`) or whitespace, so `label[for]`,
 *   `aria-describedby` and CSS selectors stay valid and unique per collection item.
 *
 * Alerts that the flow places above the page heading (e.g. the "Remove ...'s W-2" alert on the "Whose W-2" screens)
 * are outside this check; only headings after the first h1 are compared.
 */

const flow = createFlowConfig(flowNodes);
const incomeScreens = flow.screens.filter((s) => s.categoryRoute === `/flow/income`);

async function renderScreen(config: ScreenConfig) {
  await act(async () => {
    render(
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
    );
  });
}

/** Heading level skips after the first h1, as `h1 -> h3` strings. */
export function headingSkips(root: ParentNode): string[] {
  const levels = [...root.querySelectorAll(`h1, h2, h3, h4, h5, h6`)].map((h) => Number(h.tagName[1]));
  const start = levels.indexOf(1);
  if (start < 0) return [`no h1`];
  const skips: string[] = [];
  for (let i = start + 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) skips.push(`h${levels[i - 1]} -> h${levels[i]}`);
  }
  return skips;
}

/** Problems with hints, descriptions, labels and ids on the rendered page. */
export function describedByProblems(root: Document): string[] {
  const problems: string[] = [];
  for (const hint of root.querySelectorAll(`.usa-hint`)) {
    if (!hint.textContent?.trim()) problems.push(`empty hint ${hint.id || `(no id)`}`);
  }
  for (const element of root.querySelectorAll(`[aria-describedby]`)) {
    for (const id of (element.getAttribute(`aria-describedby`) ?? ``).split(/\s+/).filter(Boolean)) {
      if (!root.getElementById(id)?.textContent?.trim()) problems.push(`aria-describedby to missing or empty ${id}`);
    }
  }
  for (const label of root.querySelectorAll(`label[for]`)) {
    const id = label.getAttribute(`for`) ?? ``;
    if (!root.getElementById(id)) problems.push(`label for missing ${id}`);
  }
  for (const element of root.querySelectorAll(`[id]`)) {
    if (/[*\s]/.test(element.id) || element.id === ``) problems.push(`invalid id "${element.id}"`);
  }
  return problems;
}

describe(`Income screens: headings, hints, labels and ids`, () => {
  beforeAll(async () => {
    await initI18n();
    Element.prototype.scrollIntoView = () => undefined;
  });
  afterEach(cleanup);

  it(`covers the Income section`, () => {
    expect(incomeScreens.length).toBeGreaterThan(200);
    for (const route of [
      `w2-add-boxes-10-11`,
      `jobs-data-import-ko`,
      `data-import-int-ko`,
      `income-not-supported-intro`,
    ])
      expect(incomeScreens.map((s) => s.route)).toContain(route);
  });

  it.each(incomeScreens.map((s) => [s.route, s] as const))(`%s`, async (_route, config) => {
    await renderScreen(config);
    expect(headingSkips(document)).toEqual([]);
    expect(describedByProblems(document)).toEqual([]);
  });

  describe(`the checks themselves`, () => {
    afterEach(() => {
      document.body.innerHTML = ``;
    });

    it(`find a heading skip after the h1 but not an alert heading above it`, () => {
      document.body.innerHTML = `<h3>alert</h3><h1>Page</h1><h2>a</h2><h3>b</h3><h2>c</h2><h4>d</h4>`;
      expect(headingSkips(document)).toEqual([`h2 -> h4`]);
      document.body.innerHTML = `<h1>Page</h1><h3>skip</h3>`;
      expect(headingSkips(document)).toEqual([`h1 -> h3`]);
    });

    it(`find empty hints, dangling descriptions and labels, and ids with a *`, () => {
      document.body.innerHTML = `
        <div id="h" class="usa-hint"> </div>
        <input aria-describedby="h gone" />
        <label for="/formW2s/*/writableState">State</label>
        <select id="/formW2s/*/writableState"></select>`;
      expect(describedByProblems(document)).toEqual([
        `empty hint h`,
        `aria-describedby to missing or empty h`,
        `aria-describedby to missing or empty gone`,
        `invalid id "/formW2s/*/writableState"`,
      ]);
    });
  });
});

describe(`Income screen fixes`, () => {
  beforeAll(async () => {
    await initI18n();
  });
  afterEach(cleanup);

  const byRoute = (route: string) => {
    const config = incomeScreens.find((s) => s.route === route);
    if (!config) throw new Error(`No screen ${route}`);
    return config;
  };

  it(`W-2 boxes 10-11: format hints are tied to the inputs, and the modal links stay`, async () => {
    await renderScreen(byRoute(`w2-add-boxes-10-11`));
    const hints = document.querySelectorAll(`.usa-hint`);
    expect(hints).toHaveLength(2);
    for (const hint of hints) expect(hint.textContent).toMatch(/dollars and cents/);
    const inputs = screen.getAllByRole(`textbox`);
    expect(inputs).toHaveLength(2);
    for (const input of inputs) {
      const describedBy = input.getAttribute(`aria-describedby`) ?? ``;
      expect(describedBy).not.toBe(``);
      expect(
        describedBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? ``)
          .join(` `)
      ).toMatch(/dollars and cents/);
    }
    expect(screen.getByRole(`button`, { name: `What are dependent care benefits?` })).toBeInTheDocument();
    expect(screen.getByRole(`button`, { name: `What are nonqualified plans?` })).toBeInTheDocument();
  });

  it.each([
    [`jobs-data-import-ko`, 6],
    [`data-import-int-ko`, 8],
  ])(`%s: the accordion headings are h2 under the h1`, async (route, count) => {
    await renderScreen(byRoute(route));
    const accordionHeadings = document.querySelectorAll(`.usa-accordion__heading`);
    expect(accordionHeadings).toHaveLength(count);
    for (const heading of accordionHeadings) expect(heading.tagName).toBe(`H2`);
  });

  it(`income-not-supported-intro: the income type headings are h2 under the h1`, async () => {
    await renderScreen(byRoute(`income-not-supported-intro`));
    expect(screen.getByRole(`heading`, { level: 2, name: `Foreign` })).toBeInTheDocument();
    expect(screen.queryAllByRole(`heading`, { level: 3 })).toEqual([]);
  });

  it.each([`w2-add-boxes-15-20`, `1099-int-add-boxes-15-17`, `1099-r-add-box-15`, `hsa-distributions-add-box3`])(
    `%s: each select's id is the item's concrete path, and its label names it`,
    async (route) => {
      await renderScreen(byRoute(route));
      const selects = screen.getAllByRole(`combobox`);
      expect(selects.length).toBeGreaterThan(0);
      for (const select of selects) {
        expect(select.id).toMatch(new RegExp(`^id-/[A-Za-z0-9]+/#${uuid}/`));
        expect(select.id).not.toContain(`*`);
        expect(document.querySelector(`label[for="${CSS.escape(select.id)}"]`)).not.toBeNull();
        expect(select).toHaveAccessibleName(/\S/);
      }
    }
  );
});
