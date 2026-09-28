import { NextResponse } from 'next/server';
import { actorForWorkspace } from '@/lib/workspaces';
import { createGroup } from '@/lib/band-groups';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const workspaceId = Number(body?.workspaceId);
  if (!Number.isInteger(workspaceId)) {
    return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 });
  }
  const actor = await actorForWorkspace(workspaceId);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const name = typeof body?.name === 'string' ? body.name : '';

  const group = await createGroup({ actor, workspaceId, name });
  if (!group) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

  return NextResponse.json({ group });
}
