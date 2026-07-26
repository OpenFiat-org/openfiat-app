export default function Page() {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-white">Disputes & arbitration</h1>
      <p className="mt-1 text-sm text-gray-400">Every dispute case on the network — visible to validators acting as arbitrators, and to the parties involved.</p>
            <div className="mt-4 flex gap-2 text-xs">
        <span className="rounded-full bg-white/10 px-3 py-1 text-gray-300">All cases</span>
        <span className="rounded-full px-3 py-1 text-gray-500">My disputes</span>
        <span className="rounded-full px-3 py-1 text-gray-500">Awaiting arbitration</span>
      </div>
      <div className="mt-6 rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-gray-500">
        No data yet — this view will populate once connected to an OpenFiat node.
      </div>
    </section>
  );
}
