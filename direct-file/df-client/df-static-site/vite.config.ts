import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { JSON_SCHEMA } from 'js-yaml';
import ViteYaml from '@modyfi/vite-plugin-yaml';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import autoprefixer from 'autoprefixer';
import path from 'path';
import { createRequire } from 'module';

// @trussworks/react-uswds 8 publishes an `exports` map without its stylesheet, so the
// `@trussworks/react-uswds/lib/index.css` specifier must be resolved to the file directly.
const reactUswdsCss = path.join(
  path.dirname(createRequire(import.meta.url).resolve('@trussworks/react-uswds')),
  'index.css'
);

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.SCREENER_PUBLIC_PATH || '/',
  assetsInclude: ['**/*.svg'],
  plugins: [react(), viteTsconfigPaths(), ViteYaml({ schema: JSON_SCHEMA })],
  css: {
    devSourcemap: true,
    modules: {
      localsConvention: 'camelCaseOnly',
    },
    postcss: {
      plugins: [autoprefixer()],
    },
    preprocessorOptions: {
      scss: {
        includePaths: [`../node_modules/@uswds`, `../node_modules/@uswds/uswds/packages`],
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/test/setup.ts',
  },
  server: {
    port: 3500,
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@trussworks/react-uswds/lib/index.css': reactUswdsCss,
    },
  },
  envPrefix: ['STATIC_SITE'],
  build: {
    /**
     * More on why this is needed with Vite:
     * https://github.com/vitejs/vite/discussions/6849, which leads to:
     * https://dev.to/meduzen/when-vite-ignores-your-browserslist-configuration-3hoe
     *
     * Todo: figure out if a separate development environment browserlist is
     * needed.
     */
    target: browserslistToEsbuild(['>0.2%', 'not dead', 'not op_mini all']),
  },
});
