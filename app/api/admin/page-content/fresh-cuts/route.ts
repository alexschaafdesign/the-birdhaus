import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { saveFreshCutsContent } from '@/lib/page-content';

// Auth is enforced by the middleware in proxy.ts for every /api/admin/* route,
// so a request that reaches here is already an authenticated admin session.
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const content = await saveFreshCutsContent(body);
  revalidatePath('/fresh-cuts');
  return NextResponse.json({ content });
}
