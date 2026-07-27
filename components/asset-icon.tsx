import Image from "next/image";

export function AssetIcon({ asset, size = 18 }: { asset: string; size?: number }) {
  return (
    <Image
      src={`/currencies/${asset.toLowerCase()}.png`}
      alt={asset}
      width={size}
      height={size}
      className="rounded-full"
    />
  );
}
