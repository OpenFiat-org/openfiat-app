import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

import { BridgeFunds } from "@/components/funds/bridge-funds";

/**
 * The "e2e render shell" this task's brief asks for: mounts the real
 * `BridgeFunds` panel (not a mock) against real `en.json` messages, the way
 * `tests/exchange-assets.test.tsx` already does for the exchange's asset
 * pills. No wallet is connected and no network call is made — this proves
 * the component renders and reacts to input without crashing, and in
 * particular that flipping to Withdraw surfaces the SOL-fee notice the
 * brief calls out by name (`solFeeNotice` in the `bridgeFunds` message
 * namespace) — a full Playwright run (`tests/e2e/*.spec.ts`, à la
 * `pay-cross-chain.spec.ts`) is the heavier, real-wallet version of this
 * proof and is out of scope for a vitest-only verification pass.
 */

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <NextIntlClientProvider locale="en" messages={en}>
        <BridgeFunds />
      </NextIntlClientProvider>,
    );
  });
}

function clickButtonWithText(text: string) {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  if (!button) throw new Error(`No button with text "${text}"`);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe("BridgeFunds render shell", () => {
  it("renders the panel with Deposit selected by default", async () => {
    await mount();
    expect(container.textContent).toContain(en.bridgeFunds.title);
    expect(container.textContent).toContain(en.bridgeFunds.directionDeposit);
    expect(container.textContent).toContain(en.bridgeFunds.directionWithdraw);
    // The deposit-only "connect a source wallet" step is present...
    expect(container.textContent).toContain(en.bridgeFunds.depositStep2.replace("{chain}", "Ethereum"));
    // ...and the withdraw-only SOL-fee notice is not shown yet.
    expect(container.textContent).not.toContain(en.bridgeFunds.solFeeNotice);
  });

  it("prominently surfaces the SOL-fee notice once Withdraw is selected", async () => {
    await mount();
    await act(async () => clickButtonWithText(en.bridgeFunds.directionWithdraw));
    expect(container.textContent).toContain(en.bridgeFunds.solFeeNotice);
    expect(container.textContent).toContain(en.bridgeFunds.withdrawStep2);
  });

  it("lists every OTHER_CHAINS entry as a chain option", async () => {
    await mount();
    const options = [...container.querySelectorAll("option")].map((o) => o.textContent);
    for (const label of Object.values(en.bridgeFunds.chain)) {
      expect(options).toContain(label);
    }
  });
});
