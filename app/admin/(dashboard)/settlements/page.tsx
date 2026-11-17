import SettlementsSummaryView from '@/components/admin/SettlementsSummaryView';

export const dynamic = 'force-dynamic';

export default function SettlementsSummaryPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <SettlementsSummaryView />
    </main>
  );
}
