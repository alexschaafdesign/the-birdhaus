import type { Metadata } from 'next';
import { listExpenses, listShowOptions } from '@/lib/expenses';
import ExpensesView from '@/components/admin/ExpensesView';

export const metadata: Metadata = {
  title: 'Expenses',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminExpensesPage() {
  const [expenses, shows] = await Promise.all([listExpenses(), listShowOptions()]);
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8 text-[#E8E0D0]">
      <ExpensesView initialExpenses={expenses} shows={shows} />
    </main>
  );
}
