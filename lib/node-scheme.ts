/**
 * Choosing `http://` or `https://` for a node the user typed as `host:port`.
 *
 * # Why this is not just "default to http"
 *
 * A page served over HTTPS cannot open a plain-HTTP connection. The
 * browser blocks it as mixed content *before the request leaves*, so no
 * status code comes back, no error distinguishes it from a refused
 * connection, and `fetch` rejects exactly as it would for a node that is
 * switched off.
 *
 * That is how the app came to tell people "Could not reach an OpenFiat
 * node at 84.32.223.111:7080" about a node that was running perfectly and
 * answering `getHealth` in single-digit milliseconds. The message was
 * confidently wrong, and it pointed the operator at the node instead of at
 * the one thing that would fix it.
 *
 * So: on an HTTPS page a bare host gets `https://`, which is the only
 * scheme that can succeed there, and a failure is explained for what it
 * is. On plain HTTP — a developer running the app locally — `http://`
 * stays the default, because that is what a local node speaks.
 *
 * A user who types a scheme explicitly always gets the one they typed.
 * They may be doing something we did not anticipate, and second-guessing
 * them produces a URL they cannot see the reason for.
 */

/** Whether this page can reach plain-HTTP origins at all. */
export function pageAllowsPlainHttp(): boolean {
  // SSR has no page protocol. `true` keeps the server-rendered URL equal
  // to the local-development default, so hydration does not swap it.
  if (typeof window === "undefined") return true;
  return window.location.protocol !== "https:";
}

/**
 * Turns what the user typed into a URL to fetch.
 *
 * Loopback keeps `http://` even on an HTTPS page: browsers treat
 * `127.0.0.1` as a secure context, so a local node is reachable from a
 * deployed HTTPS app and defaulting it to `https://` would break the one
 * case that does work.
 */
export function nodeUrlFor(input: string): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) return value;

  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(value);
  const scheme = pageAllowsPlainHttp() || isLoopback ? "http" : "https";
  return `${scheme}://${value}`;
}

/**
 * Why a node could not be reached, in terms the person can act on.
 *
 * Distinguishes the mixed-content case, which is not a fault of the node
 * and cannot be fixed by retrying, from an ordinary unreachable host.
 */
export function unreachableReason(input: string): string {
  const value = input.trim();
  const explicitlyPlain = /^http:\/\//i.test(value);
  const bareHost = !/^https?:\/\//i.test(value);
  const isLoopback = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(value);

  if (!pageAllowsPlainHttp() && !isLoopback && (explicitlyPlain || bareHost)) {
    return (
      `Could not reach ${value}. This page is served over HTTPS, and a browser ` +
      `will not open a plain-HTTP connection from it — so a node without TLS ` +
      `cannot be reached from here even when it is running normally. The node ` +
      `needs a certificate (a reverse proxy in front of it is the usual way).`
    );
  }
  return `Could not reach an OpenFiat node at ${value}.`;
}
