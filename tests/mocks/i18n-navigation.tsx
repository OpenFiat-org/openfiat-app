/**
 * Test double for `@/i18n/navigation`.
 *
 * The real module comes from `next-intl`'s `createNavigation`, which imports
 * `next/navigation` in a form that resolves only inside a running Next server,
 * not under vitest/jsdom. Any unit test that renders a component with an
 * internal link or a router call would otherwise fail to even import the
 * component — nothing to do with what the test checks.
 *
 * This stub gives those components a `Link` that renders a plain anchor and
 * navigation hooks that are inert. It is aliased in `vitest.config.ts`, so
 * every test picks it up automatically; no per-test `vi.mock` needed. Tests
 * that actually assert on navigation behaviour (there are none today, and they
 * would be Playwright e2e specs if there were) must not rely on this.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

export function Link({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

export const usePathname = () => "/";
export const useRouter = () => ({
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
});
export const redirect = () => {};
export const getPathname = ({ href }: { href: string }) => href;
