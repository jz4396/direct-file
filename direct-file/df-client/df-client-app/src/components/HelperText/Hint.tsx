import { InfoDisplayProps } from '../../types/core.js';
import { buildHintKey } from '../FormControl/index.js';
import Translation from '../Translation/index.js';
import { useTranslation } from 'react-i18next';
import type { i18n as I18n } from 'i18next';
import { I18nKey } from '../Translation/Translation.js';
import { Path } from '../../fact-dictionary/Path.js';
import { CommonTranslation } from 'df-i18n';

export type HintProps = Omit<InfoDisplayProps, 'gotoNextScreen' | `i18nKey`> & {
  hintId: string;
  i18nKey: I18nKey;
};

/**
 * Whether a hint key has text to show. A key can exist only to carry a modal link
 * (`text: ""` with `helpText.modals`); rendering it would leave an empty `.usa-hint`
 * that a control's `aria-describedby` points at.
 */
function hasHintText(key: string, i18n: I18n): boolean {
  if (!i18n.exists(key)) return false;
  const value = i18n.t(key, { returnObjects: true }) as unknown;
  if (typeof value === `string`) return value.trim() !== ``;
  if (value && typeof value === `object` && `text` in value) {
    const text = (value as { text: unknown }).text;
    return typeof text === `string` && text.trim() !== ``;
  }
  return false;
}

/**
 * The namespaced keys to render for a hint, or null when none has text. Falls back to the
 * hint key built from a fact path, as the hint has always done.
 */
export function resolveHintKeys(i18nKey: I18nKey, i18n: I18n): string[] | null {
  const keys = Array.isArray(i18nKey)
    ? i18nKey.map(CommonTranslation.getNamespacedKey)
    : [CommonTranslation.getNamespacedKey(i18nKey)];
  if (keys.some((key) => i18n.exists(key))) {
    return keys.some((key) => hasHintText(key, i18n)) ? keys : null;
  }
  //check if i18nKey passed can be built into a hint key
  const builtKeys = keys.map((key) => buildHintKey(key as Path));
  return builtKeys.some((key) => hasHintText(key, i18n)) ? builtKeys : null;
}

// Use for short helper text that has style 'usa-hint' (slightly grayed out)
const Hint = ({ hintId, i18nKey, collectionId }: HintProps) => {
  const { i18n } = useTranslation();
  /* currently hints are all paths or keys that have
   their content in the info namespace */
  const hintKey = resolveHintKeys(i18nKey, i18n);
  if (!hintKey) return null;
  return (
    <div id={hintId} className='usa-hint'>
      <Translation i18nKey={hintKey} collectionId={collectionId} />
    </div>
  );
};

export default Hint;
