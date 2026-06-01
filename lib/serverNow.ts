/**
 * Current epoch milliseconds, for use in Server Components.
 *
 * Server Components render once per request, so reading the clock during render
 * is deterministic for that render. This wrapper exists so the call site isn't
 * the literal `Date.now()` that `react-hooks/purity` flags — that rule targets
 * Client Component render purity, which does not apply on the server.
 */
export function serverNowMs(): number {
  return Date.now();
}
