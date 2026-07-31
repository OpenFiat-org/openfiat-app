/**
 * A broken SDK must reach the "could not load" state, not the page.
 *
 * `@openfiat/sdk` resolves `types` to its `src` and `import` to its
 * `dist`. When those drift — a bundle built before an export existed —
 * `import { reference } from "@openfiat/sdk"` type-checks and is
 * `undefined` at runtime, so the first property access throws a TypeError
 * *synchronously*. The original loader built the request and attached
 * `.catch` to the result, which handles a refused connection and nothing
 * else: a synchronous throw happens before that handler exists, escapes
 * the loader, escapes the effect, and takes down every screen carrying a
 * currency combobox or a method picker — including the ad wizard.
 *
 * Three green toolchains missed it, because none of them executes the
 * file that actually runs. So the property is pinned here instead: the
 * loader must return a rejected promise, never throw at its caller,
 * whatever the SDK does.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const getReferenceData = vi.hoisted(() => vi.fn());

vi.mock("@openfiat/sdk", () => ({
  // Constructed by the loader and otherwise unused: the stub below stands
  // in for the transport, so nothing here should reach a network.
  Client: class {},
  reference: { getReferenceData },
}));

afterEach(() => {
  vi.resetModules();
  getReferenceData.mockReset();
});

/** Fresh module per test, since the loader caches one request per endpoint. */
async function loader() {
  return (await import("@/lib/reference")).fetchReferenceData;
}

describe("fetching the node's reference data", () => {
  it("turns a synchronous SDK failure into a rejection rather than throwing at its caller", async () => {
    // Exactly what an `undefined` namespace produces one property access
    // later, and what the old ordering let escape.
    getReferenceData.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'getReferenceData')");
    });
    const fetchReferenceData = await loader();

    let threw = false;
    let promise: Promise<unknown> | undefined;
    try {
      promise = fetchReferenceData("http://127.0.0.1:7080");
    } catch {
      threw = true;
    }
    expect(threw, "a throw here never reaches the hook's catch, so the page dies").toBe(false);
    await expect(promise).rejects.toThrow(TypeError);
  });

  it("propagates an unreachable node, so a caller can tell it apart from empty lists", async () => {
    getReferenceData.mockRejectedValue(new Error("connection refused"));
    const fetchReferenceData = await loader();

    await expect(fetchReferenceData("http://127.0.0.1:7080")).rejects.toThrow("connection refused");
  });

  it("asks a node once for a screen that mounts several controls needing the answer", async () => {
    getReferenceData.mockResolvedValue({
      revision: "r",
      currencies: [],
      countries: [],
      payment_methods: [],
      mints: [],
    });
    const fetchReferenceData = await loader();

    // The ad wizard carries a currency combobox and a method picker at
    // once; each mounting its own request would ask the same node the
    // same question twice for one render.
    const [first, second] = await Promise.all([
      fetchReferenceData("http://127.0.0.1:7080"),
      fetchReferenceData("http://127.0.0.1:7080"),
    ]);
    expect(getReferenceData).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("does not remember a failure, so a retry against a recovered node is a real retry", async () => {
    getReferenceData.mockRejectedValueOnce(new Error("connection refused"));
    const fetchReferenceData = await loader();
    await expect(fetchReferenceData("http://127.0.0.1:7080")).rejects.toThrow();

    // Caching the rejection would make every later mount fail instantly
    // against a node that has since come back.
    const answer = {
      revision: "r",
      currencies: [],
      countries: [],
      payment_methods: [],
      mints: [],
    };
    getReferenceData.mockResolvedValueOnce(answer);
    await expect(fetchReferenceData("http://127.0.0.1:7080")).resolves.toBe(answer);
  });

  it("asks each node separately, so switching nodes does not show the previous one's answer", async () => {
    getReferenceData.mockResolvedValue({
      revision: "r",
      currencies: [],
      countries: [],
      payment_methods: [],
      mints: [],
    });
    const fetchReferenceData = await loader();

    await fetchReferenceData("http://127.0.0.1:7080");
    await fetchReferenceData("https://openfiat.allenhark.com");
    expect(getReferenceData).toHaveBeenCalledTimes(2);
  });
});
