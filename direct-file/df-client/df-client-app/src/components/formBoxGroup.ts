/**
 * Form-box groups on the income screens (WCAG 2.1 SC 1.3.1).
 * The legend names the form; each amount's own label names the box or line.
 */

const FORM_BOX_FIELD_COMPONENTS = new Set([
  `Dollar`,
  `FactSelect`,
  `Boolean`,
  `Enum`,
  `MultiEnum`,
  `GenericString`,
  `LimitingString`,
  `Ein`,
  `Address`,
  `Tin`,
  `DatePicker`,
]);

type ScreenSlice = {
  componentName: string;
  props: object;
};

function stringProp(props: object, key: string): string | undefined {
  if (!(key in props)) return undefined;
  const value = (props as Record<string, unknown>)[key];
  return typeof value === `string` ? value : undefined;
}

/** Locale key for the fieldset legend, or null when the screen is not one of these forms. */
export function formBoxLegendKey(path: string | undefined | null): string | null {
  if (!path) return null;
  if (path === `/formW2s` || path.startsWith(`/formW2s/`)) return `formBoxGroups.w2`;
  if (path === `/interestReports` || path.startsWith(`/interestReports/`)) return `formBoxGroups.int`;
  if (path === `/dividendReports` || path.startsWith(`/dividendReports/`)) return `formBoxGroups.div`;
  if (path === `/form1099Rs` || path.startsWith(`/form1099Rs/`)) return `formBoxGroups.r`;
  if (path === `/scheduleCBusinesses` || path.startsWith(`/scheduleCBusinesses/`)) return `formBoxGroups.scheduleC`;
  return null;
}

export function legendKeyForScreenContent(configs: readonly ScreenSlice[]): string | null {
  for (const config of configs) {
    if (!FORM_BOX_FIELD_COMPONENTS.has(config.componentName)) continue;
    const path = stringProp(config.props, `path`);
    if (!path) continue;
    const key = formBoxLegendKey(path);
    if (key) return key;
  }
  return null;
}

/**
 * Knockout screens already state the reason. Append the shared cite + next-step alert
 * when the screen does not already include it.
 */
export function knockoutScreenNeedsNextStep(configs: readonly ScreenSlice[]): boolean {
  const isKnockout = configs.some((config) => config.componentName === `KnockoutButton`);
  if (!isKnockout) return false;
  return !configs.some((config) => {
    const key = stringProp(config.props, `i18nKey`);
    return typeof key === `string` && key.includes(`generic-other-ways-to-file`);
  });
}
