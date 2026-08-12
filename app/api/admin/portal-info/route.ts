import { NextResponse } from 'next/server';
import { getPortalInfo, updatePortalInfo } from '@/lib/portal-content';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

export async function GET() {
  const info = await getPortalInfo();
  return NextResponse.json(info);
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const infoBody = typeof body?.body === 'string' ? body.body : '';
  if (!infoBody.trim()) {
    return NextResponse.json({ error: 'Body is required.' }, { status: 400 });
  }
  const info = await updatePortalInfo(infoBody);
  return NextResponse.json(info);
}
