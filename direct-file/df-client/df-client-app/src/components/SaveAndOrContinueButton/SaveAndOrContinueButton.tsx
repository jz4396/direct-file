import { ScreenButtonProps } from '../../types/core.js';
import { SyntheticEvent, FC, useCallback, useState } from 'react';
import { Button, Icon } from '@trussworks/react-uswds';
import { Condition } from '../../flow/Condition.js';
import { useFactGraph } from '../../factgraph/FactGraphContext.js';
import Translation from '../Translation/index.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setSmoothScroll } from '../../misc/misc.js';
import { checkAllFormControlValidity } from '../../misc/constraintsApi.js';
import { useSaveAndPersistIfPossible } from '../../hooks/useSaveAndPersistIfPossible.js';
import { useIsReturnEditable } from '../../hooks/useIsReturnEditable.js';
import { ConcretePath, FactGraph, scalaListToJsArray } from '@irs/js-factgraph-scala';
import { routeToScreenWithItemId } from '../../screens/navUtils.js';

// Adds a Collection ID and context to a route so we can
// use nextRouteOverride to routes from outside a Collection Loop.
const buildRouteOverride = (
  baseRoute: string,
  factGraph: FactGraph,
  collectionContext: ConcretePath,
  collectionId: string | null
) => {
  const collectionResult = factGraph.get(collectionContext);
  const collectionItems: string[] =
    collectionResult.complete && typeof collectionResult.get.getItemsAsStrings === `function`
      ? scalaListToJsArray(collectionResult.get.getItemsAsStrings())
      : [];
  // If the next route override is not provided within a collection, it
  // won't have a collectionId so we just get the first one.
  const id = collectionId || collectionItems.find((id) => id);
  const newRoute =
    id && collectionContext && baseRoute
      ? routeToScreenWithItemId(baseRoute as string, collectionContext, id)
      : baseRoute;
  return newRoute || undefined;
};

const SaveAndOrContinueButton: FC<ScreenButtonProps> = ({
  gotoNextScreen,
  enabled,
  i18nKey,
  collectionId,
  screenHasFacts,
  factValidity,
  setShowFeedback,
  focusOnErrorOrSummary,
  nextRouteOverride,
  collectionContext,
  isOutline = false,
}) => {
  const { factGraph } = useFactGraph();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const saveAndPersistIfPossible = useSaveAndPersistIfPossible();
  const { isReturnEditable } = useIsReturnEditable();
  const i18nKeyForThisButton = i18nKey
    ? i18nKey
    : screenHasFacts && isReturnEditable
    ? `button.save`
    : `button.continue`;
  const isDisabled = enabled && !new Condition(enabled).evaluate(factGraph, collectionId);
  const [isSaving, setIsSaving] = useState(false);
  const disabledIfPressedClass = isDisabled || isSaving ? `usa-button--disabled` : undefined;

  const handleClick = useCallback(
    async (event: SyntheticEvent) => {
      event.preventDefault();

      const allFactsValid = screenHasFacts ? Array.from((factValidity || []).values()).every(Boolean) : true;
      const allFieldsValid = checkAllFormControlValidity(`the_form`);

      // Prevent additional calls if Enter key is pressed
      if (isSaving) {
        return;
      }
      const factsCount = Array.from((factValidity || []).values()).length;

      if (screenHasFacts) {
        if (allFactsValid && allFieldsValid) {
          setIsSaving(true);
          setShowFeedback(false);
          const saveResult = await saveAndPersistIfPossible();
          const routeOverrideNeedsCollectionPath = collectionContext && nextRouteOverride;
          const routeOverride = routeOverrideNeedsCollectionPath
            ? buildRouteOverride(nextRouteOverride, factGraph, collectionContext as ConcretePath, collectionId)
            : nextRouteOverride;
          if (!saveResult.hasPersistError) routeOverride ? navigate(routeOverride) : gotoNextScreen();
          setSmoothScroll(false);
          setIsSaving(false);
        } else {
          setSmoothScroll(true);
          setShowFeedback(true);
          // If there is a single field on the Screen, focus is sent to the field. However,
          // scrolling the field into view cuts off its label at the top of the browser, so we
          // scroll to the top instead and keep things consistent. The scroll happens after focus
          // moves so that it is the final scroll position.
          focusOnErrorOrSummary({ scrollToTop: factsCount === 1 });
        }
      } else {
        setSmoothScroll(false);
        const routeOverrideNeedsCollectionPath = collectionContext && nextRouteOverride;
        const routeOverride = routeOverrideNeedsCollectionPath
          ? buildRouteOverride(nextRouteOverride, factGraph, collectionContext as ConcretePath, collectionId)
          : nextRouteOverride;
        routeOverride ? navigate(routeOverride) : gotoNextScreen();
      }
    },
    [
      screenHasFacts,
      factValidity,
      isSaving,
      setShowFeedback,
      saveAndPersistIfPossible,
      collectionContext,
      nextRouteOverride,
      factGraph,
      collectionId,
      navigate,
      gotoNextScreen,
      focusOnErrorOrSummary,
    ]
  );

  const isReviewMode = searchParams.get(`reviewMode`);
  const enableGoToChecklistButton = isReviewMode === `true` && nextRouteOverride === `/checklist`;

  return (
    <div className='screen__actions'>
      <Button
        className={disabledIfPressedClass}
        type='submit'
        onClick={handleClick}
        outline={enableGoToChecklistButton || isOutline}
      >
        <Translation
          i18nKey={enableGoToChecklistButton ? `button.go-to-checklist` : i18nKeyForThisButton}
          collectionId={collectionId}
        />
        {!enableGoToChecklistButton && (
          <Icon.NavigateNext size={3} className='usa-button__icon-right' aria-hidden='true' />
        )}
      </Button>
    </div>
  );
};

export default SaveAndOrContinueButton;
