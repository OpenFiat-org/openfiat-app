import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/*
 * The Rules of Hooks and exhaustive-deps are checked here because this app is
 * almost entirely client components driving real devnet reads: a dependency
 * omitted from a `useEffect` shows a stale balance or a stale proposal rather
 * than merely rendering something odd, and nothing else in the toolchain
 * catches it — `tsc` and `next build` are both silent on it.
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    rules: {
      /*
       * Off deliberately, and not to clear a backlog: every place this fires
       * is the post-mount read of something that only exists in the browser —
       * `localStorage` node/wallet/account state — which is exactly how these
       * components avoid a hydration mismatch, and each one says so in a
       * comment. The rule's own advice (lift it out of the effect) would put
       * browser-only state into the server render and reintroduce the
       * mismatch. `rules-of-hooks` and `exhaustive-deps` stay on as errors;
       * both caught real defects when this plugin was added.
       */
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // `.next*` rather than `.next`: the README's own verification build
    // uses `BUILD_DIST_DIR=.next-verify` so it can run beside a `next dev`
    // server, and linting that output buried the app's real findings under
    // 15,000 errors from generated code.
    ignores: ["dist/**", ".next*/**", "node_modules/**", "next-env.d.ts"],
  },
);
