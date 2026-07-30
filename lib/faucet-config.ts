/**
 * Where the frontend sends faucet requests.
 *
 * An env var read at build time so a deployment can point at its own
 * instance without a code change — but unlike `lib/node-endpoint.ts`, the
 * fallback is the deployed devnet faucet rather than a localhost port.
 *
 * The two are not analogous. Anyone can run a node locally, so defaulting
 * to 127.0.0.1 there is useful. Nobody can usefully run this faucet
 * locally: it signs with an authority keypair that holds the mock-mint
 * authorities and the finite OPEN stash, and that key is not distributed.
 * So a localhost default could not work for any contributor, and produced
 * a faucet page whose only possible outcome was "Could not reach the
 * faucet service" — a failure that looks like the service being down
 * rather than the URL never having been set.
 */
export const FAUCET_URL =
  process.env.NEXT_PUBLIC_FAUCET_URL ?? "https://openfiat-faucet.allenhark.com";
