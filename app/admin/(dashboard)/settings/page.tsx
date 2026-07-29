import { getDefaultAdvanceTemplate } from '@/lib/advance';
import AdvanceTemplateEditor from '@/components/admin/AdvanceTemplateEditor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const template = await getDefaultAdvanceTemplate();

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Advance email template</h2>
        <p className="text-sm text-[#E8E0D0]/55">
          The reusable boilerplate sent to bands ahead of each show. Per-show
          details (schedule, sound engineer, show link, lineup) fill in when you
          compose an advance from a show&apos;s Advance tab.
        </p>
      </div>
      <AdvanceTemplateEditor initial={template} />
    </main>
  );
}
