import { focusOnErrorOrSummary } from './screenUtils.js';
import { ERROR_SUMMARY_ID } from './ScreenAlertAggregator/ScreenAlertAggregator.js';

/**
 * WCAG 2.1 SC 3.3.1 (Error Identification) and 2.4.3 (Focus Order): after a failed Save, focus goes
 * to the error summary or, when there is none, to the first field in error in page order.
 */
describe(`focusOnErrorOrSummary`, () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = ``;
  });

  const runFocus = (options?: Parameters<typeof focusOnErrorOrSummary>[0]) => {
    focusOnErrorOrSummary(options);
    vi.runAllTimers();
  };

  it(`focuses the first field in error in page order when several fields are in error`, () => {
    document.body.innerHTML = `
      <input id="valid" value="10.00" />
      <input id="fact-invalid" aria-invalid="true" value="12.345" />
      <select id="required-empty" required><option value=""></option><option value="a">a</option></select>
      <input id="also-fact-invalid" aria-invalid="true" value="1.2.3" />
    `;
    runFocus();
    expect(document.activeElement?.id).toBe(`fact-invalid`);
  });

  it(`treats a field that fails constraint validation as in error when it comes first`, () => {
    document.body.innerHTML = `
      <input id="valid" value="10.00" />
      <input id="required-empty" required value="" />
      <input id="fact-invalid" aria-invalid="true" value="12.345" />
    `;
    runFocus();
    expect(document.activeElement?.id).toBe(`required-empty`);
  });

  it(`does not move focus until the error feedback has rendered`, () => {
    document.body.innerHTML = `<input id="field" />`;
    focusOnErrorOrSummary();
    document.getElementById(`field`)?.setAttribute(`aria-invalid`, `true`);
    expect(document.activeElement).toBe(document.body);
    vi.runAllTimers();
    expect(document.activeElement?.id).toBe(`field`);
  });

  it(`prefers the error summary over fields in error`, () => {
    document.body.innerHTML = `
      <div id="${ERROR_SUMMARY_ID}" tabindex="-1">Errors</div>
      <input id="fact-invalid" aria-invalid="true" />
    `;
    runFocus();
    expect(document.activeElement?.id).toBe(ERROR_SUMMARY_ID);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it(`with scrollToTop, focuses without scrolling the field into view and then scrolls to the top`, () => {
    document.body.innerHTML = `<input id="fact-invalid" aria-invalid="true" />`;
    const field = document.getElementById(`fact-invalid`) as HTMLInputElement;
    const focus = vi.spyOn(field, `focus`);
    runFocus({ scrollToTop: true });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(field);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(focus.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(window.scrollTo).mock.invocationCallOrder[0]);
  });
});
