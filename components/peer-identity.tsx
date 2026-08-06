import { useTranslations } from "next-intl";
import { WalletAvatar } from "@/components/wallet-avatar";
import { shortPeerId } from "@/lib/peer-id";

/**
 * A party to a trade or a dispute, as the only thing the protocol knows about
 * them: a PeerId.
 *
 * There is no display name here and there deliberately never will be one
 * unless the key published a MerchantName claim. What there can be is a face,
 * because a robot drawn deterministically from the key is not an invented
 * fact about anybody — it is a rendering of the id already on screen, and it
 * makes "the same counterparty as last time" recognisable in a way that six
 * hex characters never manages.
 *
 * "You" is spelled out rather than avatar'd. Seeing your own robot beside
 * your own name in a two-party list is noise; what matters in that row is
 * which side you are on.
 */
export function PeerIdentity({
  peer,
  isYou = false,
  size = 22,
}: {
  peer: string;
  isYou?: boolean;
  size?: number;
}) {
  const t = useTranslations("common");
  if (isYou) return <>{t("you")}</>;
  const short = shortPeerId(peer);
  return (
    <span className="inline-flex items-center gap-2">
      <WalletAvatar seed={peer} label={short} size={size} />
      <span className="font-mono">{short}</span>
    </span>
  );
}
