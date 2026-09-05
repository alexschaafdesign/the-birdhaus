import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getAllTvImages } from '@/lib/tv-images';
import { requireAdmin } from '@/lib/admin-session';

// Curated /tv idle-pool images (069_tv_images.sql). Auth is enforced centrally
// in proxy.ts for all /api/admin/* routes.

// Full pool (active + parked), in display order — the admin list refreshes
// from this after a mutation.
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const images = await getAllTvImages();
  return NextResponse.json(images);
}

// Add an image to the pool. The URL is an already-uploaded R2 object (the
// client uploads via /api/admin/uploads with folder=tv, then posts the URL).
// New images land at the end of the order.
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
  }
  const caption = typeof body?.caption === 'string' ? body.caption.trim() || null : null;

  const [{ next }] = await sql<Array<{ next: number }>>`
    select coalesce(max(sort), 0) + 1 as next from tv_images
  `;
  const [row] = await sql<Array<{ id: number }>>`
    insert into tv_images (url, caption, sort)
    values (${url}, ${caption}, ${next})
    returning id
  `;
  return NextResponse.json({ id: Number(row.id) }, { status: 201 });
}
