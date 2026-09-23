import { NextResponse } from 'next/server';
import { getBandActor } from '@/lib/club-members';
import { createGroup } from '@/lib/band-groups';

export async function POST(request: Request) {
  const actor = await getBandActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';

  const group = await createGroup({ actor, name });
  if (!group) return NextResponse.json({ error: 'A name is required' }, { status: 400 });

  return NextResponse.json({ group });
}
