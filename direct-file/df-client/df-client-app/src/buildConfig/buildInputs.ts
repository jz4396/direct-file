import path from 'path';

/**
 * Rollup inputs for `vite build`. The all-screens page is an internal development view (every screen plus
 * fact-dictionary detail), so only an explicit `--mode development` build includes it. Production builds (the default
 * mode) and `--mode static` ship the app page alone. The dev server serves all-screens/index.html regardless of these
 * inputs, and `npm run build-all-screens` keeps its own single-file target.
 */
export const ALL_SCREENS_BUILD_MODE = `development`;

export function buildInputs(root: string, mode: string): Record<string, string> {
  const inputs: Record<string, string> = { main: path.resolve(root, `index.html`) };
  if (mode === ALL_SCREENS_BUILD_MODE) {
    inputs[`all-screens`] = path.resolve(root, `all-screens/index.html`);
  }
  return inputs;
}
