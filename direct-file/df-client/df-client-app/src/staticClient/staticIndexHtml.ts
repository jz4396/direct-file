/**
 * Remove the upstream Google Tag Manager blocks (the loader script and its <noscript> iframe) from index.html in
 * static client-only mode. Fails the build if the markers move, so the analytics cannot silently come back.
 */
export function stripAnalyticsSnippet(html: string): string {
  const blocks: [string, string][] = [
    [`<!-- Google Tag Manager (analytics) -->`, `<!-- End Google Tag Manager -->`],
    [`<!-- Google Tag Manager (analytics) (noscript) -->`, `<!-- End Google Tag Manager (noscript) -->`],
  ];
  let out = html;
  for (const [startMarker, endMarker] of blocks) {
    const start = out.indexOf(startMarker);
    const end = out.indexOf(endMarker, start);
    if (start === -1 || end === -1) {
      throw new Error(`index.html: "${startMarker}" block not found; update stripAnalyticsSnippet`);
    }
    out = out.slice(0, start) + out.slice(end + endMarker.length);
  }
  return out;
}

/** <title> of the static client-only build (the app replaces it per page, see components/Head/Head.tsx). */
export const STATIC_TITLE = `Direct File interview preview (unofficial)`;
export const STATIC_DESCRIPTION =
  `Unofficial, client-only preview of the open-source Direct File tax interview. Not affiliated with the IRS. ` +
  `It can’t e-file or print, and your answers stay in your browser.`;

function replaceOnce(html: string, re: RegExp, replacement: string, what: string): string {
  if (!re.test(html)) throw new Error(`index.html: ${what} not found; update prepareStaticIndexHtml`);
  return html.replace(re, replacement);
}

/**
 * index.html for the static client-only build: no analytics, and a title and description that make no claim to be
 * the official service. Also asks search engines not to index the preview (with X-Robots-Tag and robots.txt).
 */
export function prepareStaticIndexHtml(html: string): string {
  let out = stripAnalyticsSnippet(html);
  out = replaceOnce(out, /<title>[^<]*<\/title>/, `<title>${STATIC_TITLE}</title>`, `<title>`);
  out = replaceOnce(
    out,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${STATIC_DESCRIPTION}" />\n    <meta name="robots" content="noindex, nofollow" />`,
    `<meta name="description">`
  );
  return out;
}
