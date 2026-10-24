import { mergeConfig, defineConfig } from 'vitest/config';
import { configOptions as viteConfig } from './vite.config';
import { DefaultReporter } from 'vitest/reporters';

/**
 * Real-browser tests (`*.e2e.ts`), kept out of the default vitest run because they need the staged static site and
 * an installed Chrome. `npm run test:no-retention` builds and stages the site, then runs them.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.e2e.ts'],
      reporters: [new DefaultReporter()],
      fileParallelism: false,
      testTimeout: 180_000,
      hookTimeout: 60_000,
    },
  })
);
