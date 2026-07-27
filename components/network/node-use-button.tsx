"use client";

import { useEffect, useState } from "react";
import { NODE_CHANGED_EVENT, readNodeSelection, writeNodeSelection } from "@/lib/node-preference";

/** "Use" / "Connected" control for a node row — shares the footer's preference. */
export function NodeUseButton({ nodeId }: { nodeId: string }) {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setCurrent(readNodeSelection().id);
    update();
    window.addEventListener(NODE_CHANGED_EVENT, update);
    return () => window.removeEventListener(NODE_CHANGED_EVENT, update);
  }, []);

  if (current === nodeId) {
    return (
      <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
        Connected
      </span>
    );
  }

  return (
    <button
      onClick={() => writeNodeSelection(nodeId)}
      className="rounded-md border border-white/15 px-3 py-1 text-xs text-gray-300 hover:bg-white/5"
    >
      Use
    </button>
  );
}
