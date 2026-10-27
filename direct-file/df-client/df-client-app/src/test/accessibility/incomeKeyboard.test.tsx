import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { initI18n } from '../../i18n.js';
import Screen from '../../components/Screen.js';
import { AllScreensContext, uuid } from '../../all-screens/AllScreensContext.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import { ScreenConfig } from '../../flow/ScreenConfig.js';
import '../../styles/App.scss';

/**
 * Keyboard-only pass (WCAG 2.1 SC 2.1.1, 2.4.3, 2.4.7) through one W-2, one 1099-INT, and one 1099-R.
 * Tab order follows the controls in the document. Focus is not trapped: after the last control, Tab
 * moves on. A focused control keeps a visible outline (the interview focus style).
 *
 * A cloud agent cannot run NVDA or VoiceOver. The assertions below are the names, roles, and states
 * those screen readers would speak for one W-2 amount screen and one knockout.
 */

const flow = createFlowConfig(flowNodes);

function getScreen(route: string): ScreenConfig {
  const config = flow.screens.find((s) => s.route === route);
  if (!config) throw new Error(`No screen ${route}`);
  return config;
}

async function renderScreen(route: string) {
  const config = getScreen(route);
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

function tabbable(root: ParentNode): HTMLElement[] {
  // happy-dom's tabIndex IDL is -1 unless the attribute is set. Tab order follows the attribute, same as user-event.
  return [...root.querySelectorAll<HTMLElement>(`a[href], button, input, select, textarea, [tabindex]`)].filter(
    (el) => {
      if (el.hasAttribute(`disabled`) || el.getAttribute(`aria-disabled`) === `true`) return false;
      if ((el as HTMLInputElement).type === `hidden`) return false;
      const explicit = el.getAttribute(`tabindex`);
      if (explicit !== null && Number(explicit) < 0) return false;
      if (el.closest(`[hidden], [aria-hidden="true"]`)) return false;
      return true;
    }
  );
}

describe(`Income screens: keyboard order and screen-reader names`, () => {
  beforeAll(async () => {
    await initI18n();
    Element.prototype.scrollIntoView = () => undefined;
  });
  afterEach(cleanup);

  it.each([
    [`W-2 boxes 1-8`, `w2-add-boxes-1-8`, `Form W-2`, /Form W-2, Box 1/],
    [`1099-INT box 1`, `1099-int-add-box-1`, `Form 1099-INT`, /Form 1099-INT, Box 1/],
    [`1099-R box 2a`, `1099-r-add-box-2a`, `Form 1099-R`, /Form 1099-R, Box 2a/],
  ])(`%s tabs in document order, with a visible outline and no trap`, async (_name, route, legend, label) => {
    await renderScreen(route);
    expect(screen.getByRole(`group`, { name: legend })).toBeInTheDocument();
    expect(screen.getByRole(`textbox`, { name: label })).toBeInTheDocument();
    expect(screen.getAllByRole(`heading`, { level: 1 })).toHaveLength(1);

    const controls = tabbable(document.body);
    expect(controls.length).toBeGreaterThan(1);

    const user = userEvent.setup();
    document.body.focus();
    const seen: HTMLElement[] = [];
    for (let i = 0; i < controls.length + 1; i++) {
      await user.tab();
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body || seen.includes(active)) break;
      seen.push(active);
      const style = getComputedStyle(active);
      const outlineVisible = style.outlineStyle !== `none` && style.outlineWidth !== `0px`;
      const shadowVisible = style.boxShadow !== `none` && style.boxShadow !== ``;
      expect(outlineVisible || shadowVisible).toBe(true);
    }

    const positions = seen.map((el) => controls.indexOf(el));
    expect(positions.every((position) => position >= 0)).toBe(true);
    for (let i = 1; i < positions.length; i++) expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    expect(seen.length).toBe(controls.length);
  });

  it(`a knockout exposes an alert with the reason, a cite, and a next step`, async () => {
    await renderScreen(`1099-div-box-5-knockout`);
    expect(screen.getByRole(`heading`, { level: 1 })).toHaveAccessibleName(/\S/);
    const alerts = screen.getAllByRole(`alert`);
    expect(alerts.length).toBeGreaterThan(0);
    const text = alerts.map((alert) => alert.textContent ?? ``).join(` `);
    expect(text).toMatch(/section 199A|199A/i);
    expect(screen.getByRole(`link`, { name: /IRS forms and instructions/i })).toHaveAttribute(
      `href`,
      `https://www.irs.gov/forms-instructions`
    );
    expect(screen.getByRole(`link`, { name: /Find other ways to file your federal taxes/i })).toHaveAttribute(
      `href`,
      `https://www.irs.gov/filing/individuals/how-to-file`
    );
  });
});
