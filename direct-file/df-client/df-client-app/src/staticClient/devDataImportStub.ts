import type { DataImportProfile } from '../redux/slices/data-import/dataImportProfileTypes.js';

/**
 * Stand-in for `DevDataImportConfig` in the static client build.
 * The clientside-intercept fixtures (and their JSON) stay out of that bundle.
 */
export function getProfileForClientsideIntercept(): DataImportProfile {
  throw new Error(`data-import fixtures are not in the static client`);
}
