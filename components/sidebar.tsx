import Image from "next/image";
import Link from "next/link";

const SECTIONS: Array<[string, Array<[string, string]>]> = [
  ["", [["Overview", "/"]]],
  [
    "Trade",
    [
      ["Marketplace", "/trade"],
      ["Transaction history", "/transactions"],
    ],
  ],
  [
    "Network",
    [
      ["Network view", "/network"],
      ["Staking", "/staking"],
      ["Governance", "/governance"],
    ],
  ],
  [
    "Trust",
    [
      ["Disputes & arbitration", "/disputes"],
      ["Identity & reputation", "/identity"],
    ],
  ],
  ["", [["Settings", "/settings"]]],
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-white/10 p-4">
      <div className="mb-6 flex items-center gap-2 text-lg font-semibold text-white">
        <Image src="/logo.png" alt="" width={24} height={24} priority />
        OpenFiat
      </div>
      <nav className="space-y-4">
        {SECTIONS.map(([title, links], i) => (
          <div key={title || i}>
            {title && (
              <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {title}
              </div>
            )}
            <div className="space-y-1">
              {links.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="block rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-brand-hover"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
