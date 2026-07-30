/**
 * Where the frontend sends faucet requests.
 *
 * Follows `lib/node-endpoint.ts`'s own convention: an env var read at build
 * time so a deployment can point at its own faucet instance without a code
 * change, falling back to the faucet service's own local-dev default port
 * (`openfiat-faucet`'s `PORT=8787`) for a contributor running both `pnpm
 * dev` and the faucet service locally.
 */
export const FAUCET_URL = process.env.NEXT_PUBLIC_FAUCET_URL ?? "http://127.0.0.1:8787";
