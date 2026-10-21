import { mergeConfig, defineConfig } from 'vitest/config';
import { configOptions as viteConfig } from './vite.config';
import { DefaultReporter } from 'vitest/reporters';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      reporters: [new DefaultReporter()],
    },
  })
);
