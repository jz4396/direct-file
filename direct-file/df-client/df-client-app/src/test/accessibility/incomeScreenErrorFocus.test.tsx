import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import { initI18n } from '../../i18n.js';
import Screen from '../../components/Screen.js';
import { AllScreensContext, uuid } from '../../all-screens/AllScreensContext.js';
import { createFlowConfig } from '../../flow/flowConfig.js';
import flowNodes from '../../flow/flow.js';
import { ScreenConfig } from '../../flow/ScreenConfig.js';

/**
 * WCAG 2.1 SC 3.3.1 (Error Identification) and 2.4.3 (Focus Order) on the income entry screens.
 *
 * When a filer presses Save with an error on the screen, keyboard focus has to land on the
 * field in error (or on the error summary when the screen has several fields), and the
 * error text has to be part of that control's accessible description at the moment focus
 * arrives, so a screen reader announces it.
 */

const flow = createFlowConfig(flowNodes);

function getScreen(route: string): ScreenConfig {
  const config = flow.screens.find((s) => s.route === route);
  if (!config) throw new Error(`No screen with route ${route}`);
  return config;
}

async function renderIncomeScreen(route: string) {
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

type FocusSnapshot = { element: Element; invalid: string | null; description: string };

/** Record what assistive technology would announce at the moment focus lands on each element. */
function recordFocusAnnouncements() {
  const snapshots: FocusSnapshot[] = [];
  const listener = (event: FocusEvent) => {
    const element = event.target as Element;
    const describedBy = element.getAttribute(`aria-describedby`) ?? ``;
    const description = describedBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? ``)
      .join(` `);
    snapshots.push({ element, invalid: element.getAttribute(`aria-invalid`), description });
  };
  document.addEventListener(`focusin`, listener);
  return { snapshots, stop: () => document.removeEventListener(`focusin`, listener) };
}

type ScrollEvent = { kind: `focus` | `scrollTo` | `scrollIntoView`; target?: Element; top?: number };

/** Record focus moves and scroll calls in the order they happen. */
function recordFocusAndScroll() {
  const events: ScrollEvent[] = [];
  const onFocus = (event: FocusEvent) => events.push({ kind: `focus`, target: event.target as Element });
  document.addEventListener(`focusin`, onFocus);
  const scrollTo = vi.spyOn(window, `scrollTo`).mockImplementation(((options?: ScrollToOptions) => {
    events.push({ kind: `scrollTo`, top: options?.top });
  }) as typeof window.scrollTo);
  const scrollIntoView = vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(function (this: Element) {
    events.push({ kind: `scrollIntoView`, target: this });
  });
  return {
    events,
    stop: () => {
      document.removeEventListener(`focusin`, onFocus);
      scrollTo.mockRestore();
      scrollIntoView.mockRestore();
    },
  };
}

async function flushDeferredFocus() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pressSave() {
  await act(async () => {
    fireEvent.click(screen.getByRole(`button`, { name: /save|continue/i }));
  });
}

describe(`Income screens: focus and error identification after Save`, () => {
  beforeAll(async () => {
    await initI18n();
    Element.prototype.scrollIntoView = () => undefined;
    window.scrollTo = () => undefined;
  });

  it(`moves focus to a single dollar field with a format error (1099-INT box 1)`, async () => {
    await renderIncomeScreen(`1099-int-add-box-1`);
    const input = screen.getByRole(`textbox`, { name: /Box 1/ });
    fireEvent.change(input, { target: { value: `12.345` } });

    const recorder = recordFocusAnnouncements();
    await pressSave();
    await waitFor(() => expect(input).toHaveFocus());
    recorder.stop();

    expect(input).toHaveAttribute(`aria-invalid`, `true`);
    expect(input).toHaveAccessibleDescription(/only two numbers \(cents\)/);
    const announced = recorder.snapshots.filter((s) => s.element === input);
    expect(announced.length).toBeGreaterThan(0);
    expect(announced[0].invalid).toBe(`true`);
    expect(announced[0].description).toMatch(/only two numbers \(cents\)/);
  });

  it.each([
    [`1099-INT nominee`, `1099-int-nominee`],
    [`W-2 box 12 code G governmental 457(b)`, `w2-governmental-457b`],
    [`1099-R box 7 IRA/SEP/SIMPLE`, `retirement-add-box-7-checkbox`],
  ])(`announces the error when focus moves to an unanswered yes/no question (%s)`, async (_name, route) => {
    await renderIncomeScreen(route);
    const yes = screen.getByRole(`radio`, { name: /yes/i });
    const no = screen.getByRole(`radio`, { name: /no/i });

    const recorder = recordFocusAnnouncements();
    await pressSave();
    await waitFor(() => expect(yes).toHaveFocus());
    recorder.stop();

    for (const radio of [yes, no]) {
      expect(radio).toHaveAttribute(`aria-invalid`, `true`);
      expect(radio).toHaveAccessibleDescription(/This field is required/);
    }
    const announced = recorder.snapshots.filter((s) => s.element === yes);
    expect(announced.length).toBeGreaterThan(0);
    expect(announced[0].invalid).toBe(`true`);
    expect(announced[0].description).toMatch(/This field is required/);
  });

  it(`leaves valid yes/no questions without an error description`, async () => {
    await renderIncomeScreen(`1099-int-nominee`);
    const yes = screen.getByRole(`radio`, { name: /yes/i });
    expect(yes).not.toHaveAttribute(`aria-invalid`, `true`);
    expect(yes).not.toHaveAttribute(`aria-describedby`);
  });

  it(`still focuses the error summary on a screen with several fields (W-2 boxes 1-8)`, async () => {
    await renderIncomeScreen(`w2-add-boxes-1-8`);
    const [firstAmount] = screen.getAllByRole(`textbox`);
    fireEvent.change(firstAmount, { target: { value: `1.2.3` } });

    await pressSave();
    const summary = await screen.findByRole(`alert`);
    await waitFor(() => expect(summary).toHaveFocus());
  });

  /*
   * On a screen with a single field, scrolling the focused field into view cuts off its label and the
   * question above it, so the window is scrolled to the top. That scroll must come after focus moves
   * (and after any scroll focus causes), or the label ends up off screen.
   */
  it.each([
    [`1099-INT box 1 amount`, `1099-int-add-box-1`, () => screen.getByRole(`textbox`, { name: /Box 1/ }), `12.345`],
    [`1099-INT nominee yes/no`, `1099-int-nominee`, () => screen.getByRole(`radio`, { name: /yes/i }), null],
  ])(
    `on a single-field screen, focuses the field first and scrolls to the top last (%s)`,
    async (_name, route, getField, value) => {
      await renderIncomeScreen(route);
      const field = getField();
      if (value !== null) fireEvent.change(field, { target: { value } });

      const recorder = recordFocusAndScroll();
      await pressSave();
      await waitFor(() => expect(field).toHaveFocus());
      await flushDeferredFocus();
      recorder.stop();

      const { events } = recorder;
      const focusIndex = events.findIndex((e) => e.kind === `focus` && e.target === field);
      expect(focusIndex).toBeGreaterThanOrEqual(0);
      const afterFocus = events.slice(focusIndex + 1);
      expect(afterFocus.filter((e) => e.kind === `scrollIntoView`)).toEqual([]);
      expect(events.at(-1)).toEqual({ kind: `scrollTo`, top: 0 });
      expect(field).toHaveFocus();
    }
  );

  it(`on a screen with several fields, scrolls the error summary into view, not to the top`, async () => {
    await renderIncomeScreen(`w2-add-boxes-1-8`);
    const [firstAmount] = screen.getAllByRole(`textbox`);
    fireEvent.change(firstAmount, { target: { value: `1.2.3` } });

    const recorder = recordFocusAndScroll();
    await pressSave();
    const summary = await screen.findByRole(`alert`);
    await waitFor(() => expect(summary).toHaveFocus());
    await flushDeferredFocus();
    recorder.stop();

    expect(recorder.events.some((e) => e.kind === `scrollIntoView` && e.target === summary)).toBe(true);
    expect(recorder.events.some((e) => e.kind === `scrollTo`)).toBe(false);
  });
});
