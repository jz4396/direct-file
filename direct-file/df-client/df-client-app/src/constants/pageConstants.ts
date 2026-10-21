//page or query-parameter constants

import { DataImportRolloutBehavior } from '../redux/slices/data-import/dataImportProfileTypes.js';
import { isStaticClientOnly } from '../staticClient/staticMode.js';

export const LOCAL_DATA_IMPORT_BEHAVIOR = `DATA_IMPORT_ABOUT_YOU_BASIC_PLUS_IP_PIN_PLUS_W2_PLUS_1099_INT_PLUS_1095_A`;
export const DEFAULT_DATA_IMPORT_BEHAVIOR = `DATA_IMPORT_ABOUT_YOU_BASIC_PLUS_IP_PIN_PLUS_W2`;

export const REF_LOCATION = `ref_location`;

export const REF_LOCATION_VALUE = {
  SCREENER: `df_screener`,
  HOME: `df_home`,
  SUBMISSION: `df_submission`,
  AUTHSTATE: `df_authorize_state`,
} as const;

export const environmentNames = [`LOCALHOST`, `STATIC_CLIENT`] as const;
export type EnvironmentName = (typeof environmentNames)[number];

export type EnvironmentConfig = {
  hostNames: string[];
  // Is allowed to enter the flow
  flowEnabled: boolean;
  // Is allowed to transfer their federal return to state tools
  returnTransferEnabled: boolean;

  // Is allowed to access developer console
  developerToolsEnabled: boolean;

  // Is allowed to load a preauthUuid for authentication
  preauthUuidEnabled: boolean;

  isProd: boolean;

  // Test data import flows
  dataImportMode: 'clientside-intercept' | 'real-api';

  // Enable telemetry logging
  isTelemetryEnabled: boolean;

  // Do we allow switching to Spanish
  isSpanishEnabled: boolean;

  defaultDataImportRolloutBehavior: DataImportRolloutBehavior;
};

// List of client hosts and their configurations.
// TODO: https://git.irslabs.org/irslabs-prototypes/direct-file/-/issues/8485
// In static client-only mode (src/staticClient) the STATIC_CLIENT config applies to whatever origin serves the
// bundle, and LOCALHOST applies to none, so a local preview of the static build behaves like the deployed one.
const staticClient = isStaticClientOnly();
const currentOrigin = typeof location !== `undefined` ? location.origin : ``;

export const ENVIRONMENT_CONFIGS: Record<EnvironmentName, EnvironmentConfig> = {
  LOCALHOST: {
    hostNames: staticClient ? [] : [`http://localhost`],
    flowEnabled: true,
    returnTransferEnabled: true,
    developerToolsEnabled: true,
    preauthUuidEnabled: true,
    isProd: false,
    dataImportMode: `real-api`,
    isTelemetryEnabled: true,
    isSpanishEnabled: true,
    defaultDataImportRolloutBehavior: `DATA_IMPORT_ABOUT_YOU_BASIC_PLUS_IP_PIN_PLUS_W2_PLUS_1099_INT_PLUS_1095_A`,
  },
  STATIC_CLIENT: {
    hostNames: staticClient && currentOrigin ? [currentOrigin] : [],
    flowEnabled: true,
    // No backend: no state transfer, no developer tools that talk to the API, no telemetry.
    returnTransferEnabled: false,
    developerToolsEnabled: false,
    preauthUuidEnabled: false,
    isProd: true,
    // Unused: getDataImportMode() returns `disabled` in static mode (there is no data import service).
    dataImportMode: `real-api`,
    isTelemetryEnabled: false,
    isSpanishEnabled: true,
    defaultDataImportRolloutBehavior: `DATA_IMPORT_ABOUT_YOU_BASIC`,
  },
} as const;

export const isFlowEnabled = (): boolean => {
  return Object.values(ENVIRONMENT_CONFIGS)
    .filter((config) => config.flowEnabled)
    .some((config) => config.hostNames.some((hostName) => location.href.startsWith(hostName)));
};

export const isReturnTransferEnabled = (): boolean => {
  return Object.values(ENVIRONMENT_CONFIGS)
    .filter((config) => config.returnTransferEnabled)
    .some((config) => config.hostNames.some((hostName) => location.href.startsWith(hostName)));
};

export const isDeveloperToolsEnabled = (): boolean => {
  return Object.values(ENVIRONMENT_CONFIGS)
    .filter((config) => config.developerToolsEnabled)
    .some((config) => config.hostNames.some((hostName) => location.href.startsWith(hostName)));
};

/**
 * PreauthUuid is a dev tool, so we check to make sure that
 * developerToolsEnabled as well as preauthUuidEnabled
 *
 * We just needed to turn it off in some environments where dev tools are on, but if dev tools are off,
 * preauthUuid should also be off.
 *
 * Anything else would be a misconfiguration.
 */
export const showPreauthUuidPanelOnDashboard = (): boolean => {
  return Object.values(ENVIRONMENT_CONFIGS)
    .filter((config) => config.developerToolsEnabled && config.preauthUuidEnabled)
    .some((config) => config.hostNames.some((hostName) => location.href.startsWith(hostName)));
};

export const getDataImportMode = (): 'disabled' | 'clientside-intercept' | 'real-api' => {
  // Static client-only mode has no data import service, and the session override must not turn one on.
  if (isStaticClientOnly()) return `disabled`;
  const override = typeof sessionStorage !== `undefined` ? sessionStorage.getItem(`DATAIMPORT_MODE_OVERRIDE`) : ``;
  if (override === `clientside-intercept` || override === `real-api`) {
    return override;
  }
  const configs = Object.values(ENVIRONMENT_CONFIGS).filter((config) =>
    config.hostNames.some((hostName) => {
      if (typeof location !== `undefined`) {
        return location.href.startsWith(hostName);
      }
      return false;
    })
  );
  if (configs.length !== 1) {
    return `disabled`;
  }
  const config = configs[0];
  return config.dataImportMode;
};

export const getDataImportDefaultRolloutBehavior = (): DataImportRolloutBehavior => {
  const configs = Object.values(ENVIRONMENT_CONFIGS).filter((config) =>
    config.hostNames.some((hostName) => {
      if (typeof location !== `undefined`) {
        return location.href.startsWith(hostName);
      }
      return false;
    })
  );
  if (configs.length !== 1) {
    return `DATA_IMPORT_ABOUT_YOU_BASIC_PLUS_IP_PIN_PLUS_W2`;
  }
  const config = configs[0];
  return config.defaultDataImportRolloutBehavior;
};

export const isTelemetryEnabled = (): boolean => {
  return Object.values(ENVIRONMENT_CONFIGS)
    .filter((config) => config.isTelemetryEnabled)
    .some((config) =>
      config.hostNames.some((hostName) => typeof location !== `undefined` && location.href.startsWith(hostName))
    );
};

export const is1099RFeatureFlagEnabled = (): boolean => {
  return true;
};

export const isSpanishEnabled = (): boolean => {
  return Object.values(ENVIRONMENT_CONFIGS)
    .filter((config) => config.isSpanishEnabled)
    .some((config) => config.hostNames.some((hostName) => location.href.startsWith(hostName)));
};
