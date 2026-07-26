export default function OverviewPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-white">Overview</h1>
      <p className="mt-1 text-sm text-gray-400">
        Your account at a glance. Data below is placeholder until this app is
        connected to an OpenFiat node and wallet.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-gray-400">Wallet balance</p>
          <p className="mt-2 text-3xl font-semibold text-white">—</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-gray-400">Open trades</p>
          <p className="mt-2 text-3xl font-semibold text-white">—</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-gray-400">Staked amount</p>
          <p className="mt-2 text-3xl font-semibold text-white">—</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          <p className="text-sm text-gray-400">Reputation score</p>
          <p className="mt-2 text-3xl font-semibold text-white">—</p>
        </div>
      </div>
      <div className="mt-8 rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-gray-500">
        Recent activity will appear here once connected to a node.
      </div>
    </section>
  );
}
