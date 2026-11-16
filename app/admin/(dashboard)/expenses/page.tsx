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
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <ExpensesView initialExpenses={expenses} shows={shows} />
    </main>
  );
}
