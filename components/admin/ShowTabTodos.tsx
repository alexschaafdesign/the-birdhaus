import { getOneShowHealth } from '@/lib/show-health-data';
import { openTodos } from '@/lib/show-health';
import { getTodayCentral } from '@/lib/shows';
import { TodoMark } from './ui';

// The open to-dos a tab fixes (given issue keys), shown as amber marks where
// the tab's work happens. Renders nothing when they're all done. Same issues
// as the to-do line under the show title (lib/show-health).
export default async function ShowTabTodos({ showId, keys }: { showId: number; keys: string[] }) {
  const facts = await getOneShowHealth(showId);
  if (!facts) return null;
  const todos = openTodos(facts, getTodayCentral());
  const open = keys.filter((k) => todos[k]);
  if (open.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {open.map((k) => (
        <TodoMark key={k}>{todos[k]}</TodoMark>
      ))}
    </div>
  );
}
