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
