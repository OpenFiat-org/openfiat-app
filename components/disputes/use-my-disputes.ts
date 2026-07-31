"use client";

import { MY_DISPUTES, myDisputes, type Dispute } from "@/lib/live-disputes";
import { useSignedRead, type SignedReadState } from "@/components/use-signed-read";

/**
 * The dispute cases the connected wallet can actually read: the ones it is
 * the buyer or the seller of, and the ones it is seated on as an arbitrator.
 *
 * Every screen that wants a party's own view of a case goes through this, and
 * none of them filters the public docket instead. That distinction is the
 * whole point: the public docket no longer says who is in a case, and joining
 * redacted rows back together to work out who is would be the same disclosure
 * with extra steps.
 *
 * `data` is null until a read succeeds — deliberately not an empty array.
 * "You have no cases" and "you have not asked" are different answers, and a
 * screen that cannot tell them apart will tell someone they have no disputes
 * when they have simply not signed yet.
 */
export function useMyDisputes(): SignedReadState<Dispute[]> {
  return useSignedRead(myDisputes, MY_DISPUTES);
}
