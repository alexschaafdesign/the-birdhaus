import SettlementsSummaryView from '@/components/admin/SettlementsSummaryView';

export const dynamic = 'force-dynamic';

export default function SettlementsSummaryPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <SettlementsSummaryView />
    </main>
  );
}
