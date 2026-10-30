import { ConcretePath, FactGraph } from '@irs/js-factgraph-scala';
import { FlowConfig, FlowSubcategory } from '../flow/flowConfig.js';
import { ScreenConfig } from '../flow/ScreenConfig.js';
import { conditionsPass } from '../utils/condition.js';

const CHECKLIST = `/checklist`;

/**
 * Headings the interview would show. A heading whose conditions fail, or that is
 * marked displayOnlyOn data-view, is not visible. This matches the filter in useScreenInfo.
 */
export function visibleHeadingCount(screen: ScreenConfig, factGraph: FactGraph, collectionId: string | null): number {
  return screen.content.filter(
    (content) =>
      content.componentName === `Heading` &&
      // eslint-disable-next-line eqeqeq
      content.props.displayOnlyOn != `data-view` &&
      conditionsPass(content.props, factGraph, collectionId)
  ).length;
}

/**
 * Same collection id the checklist uses for a section: an empty query string, so only
 * `/primaryFiler` and `/secondaryFiler` resolve. Other collections come from the URL.
 */
function sectionCollectionId(factGraph: FactGraph, collectionName: ConcretePath | undefined): string | null {
  if (collectionName === `/primaryFiler` || collectionName === `/secondaryFiler`) {
    const filer = factGraph.get(collectionName);
    return filer.complete ? filer.get.idString : null;
  }
  return null;
}

function canShow(screen: ScreenConfig, factGraph: FactGraph, collectionId: string | null): boolean {
  try {
    return screen.isAvailable(factGraph, collectionId) && visibleHeadingCount(screen, factGraph, collectionId) === 1;
  } catch {
    return false;
  }
}

/** First screen in the section that can be shown, as the checklist would open it. */
export function firstApplicableRoute(subcategory: FlowSubcategory, factGraph: FactGraph): string | undefined {
  const collectionId = sectionCollectionId(factGraph, subcategory.collectionName);
  const screen = subcategory.screens.find((candidate) => canShow(candidate, factGraph, collectionId));
  return screen?.fullRoute(collectionId);
}

/**
 * Where to send a person who opened a gated screen, or null when this screen can be shown.
 *
 * A screen whose gate fails, or whose headings are all gated off, used to render anyway.
 * Screen then threw because it did not have exactly one heading, and the site-wide error
 * boundary unmounted the in-memory return. Redirect to the section's first screen that
 * can be shown, or to the checklist when the section has none.
 *
 * More than one visible heading is a content error and is left for Screen to report.
 */
export function gatedScreenRedirect(
  screen: ScreenConfig,
  factGraph: FactGraph,
  collectionId: string | null,
  flow: FlowConfig
): string | null {
  let available = false;
  let headings = 0;
  try {
    available = screen.isAvailable(factGraph, collectionId);
    headings = visibleHeadingCount(screen, factGraph, collectionId);
  } catch {
    available = false;
    headings = 0;
  }
  if (available && headings >= 1) return null;

  const subcategory = flow.subcategoriesByRoute.get(screen.subcategoryRoute);
  const target = subcategory ? firstApplicableRoute(subcategory, factGraph) : undefined;
  if (!target || target === screen.fullRoute(collectionId)) return CHECKLIST;
  return target;
}

/**
 * Collection id BaseScreen reads for this URL: filer ids come from the return, everything else from the query.
 */
function collectionIdForSearch(screen: ScreenConfig, factGraph: FactGraph, search: string): string | null {
  const collectionName = screen.collectionContext;
  // eslint-disable-next-line eqeqeq
  if (collectionName == undefined) return null;
  if (collectionName === `/primaryFiler` || collectionName === `/secondaryFiler`) {
    const filer = factGraph.get(collectionName);
    return filer.complete ? filer.get.idString : null;
  }
  const query = search.startsWith(`?`) ? search.slice(1) : search;
  return new URLSearchParams(query).get(collectionName);
}

/** fullRoute copies window.location.search, which is the query the interview is open on. */
function withLocationSearch<T>(search: string, run: () => T): T {
  const previous = `${window.location.pathname}${window.location.search}`;
  const query = search === `` ? `` : search.startsWith(`?`) ? search : `?${search}`;
  window.history.pushState({}, ``, `${window.location.pathname}${query}`);
  try {
    return run();
  } finally {
    window.history.pushState({}, ``, previous || `/`);
  }
}

export type GatedLanding = { path: string; search: string };

/**
 * Pathname the interview settles on, following the same redirects as BaseScreen.
 * A screen that can be shown settles on its own route. The query is the one fullRoute
 * would keep, so a later hop sees the same collection id the browser would.
 */
export function settledGatedLanding(
  screen: ScreenConfig,
  factGraph: FactGraph,
  flow: FlowConfig,
  search = ``
): GatedLanding {
  const seen = new Set<string>();
  let current = screen;
  let currentSearch = search === `` || search.startsWith(`?`) ? search : `?${search}`;
  for (let hop = 0; hop < 8; hop++) {
    const marker = `${current.screenRoute}${currentSearch}`;
    if (seen.has(marker)) return { path: CHECKLIST, search: `` };
    seen.add(marker);
    const collectionId = collectionIdForSearch(current, factGraph, currentSearch);
    const target = withLocationSearch(currentSearch, () => gatedScreenRedirect(current, factGraph, collectionId, flow));
    if (!target) return { path: current.screenRoute, search: currentSearch };
    const path = target.split(`?`)[0];
    if (path === CHECKLIST) return { path: CHECKLIST, search: `` };
    const next = flow.screensByRoute.get(path);
    if (!next) return { path, search: target.includes(`?`) ? target.slice(target.indexOf(`?`)) : `` };
    current = next;
    currentSearch = target.includes(`?`) ? target.slice(target.indexOf(`?`)) : ``;
  }
  return { path: CHECKLIST, search: `` };
}
