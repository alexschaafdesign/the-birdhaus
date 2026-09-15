import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import {
  DAYS_OPEN_VALUES,
  getEventById,
  setDaysOpenDefault,
  type DaysOpenDefault,
} from '@/lib/song-club';
import {
  addGroup,
  assignAttendeeGroup,
  createGroups,
  deleteGroup,
  distributeUnassigned,
  getGroup,
  listGroupRoster,
  listGroups,
} from '@/lib/club-groups';

// Group management for one event. Admin-gated by proxy.ts + requireAdmin.
//
// PATCH accepts one of (mirrors the playlists route's multi-shape PATCH):
//   { create: { count } }                make the event's groups (Group A…)
//   { addGroup: true }                   append one more group (Group E, F…)
//   { assign: { userId, groupId } }      move one attendee (groupId null = unassign)
//   { distribute: true }                 spread ONLY unassigned attendees evenly
//   { deleteGroupId: number }            remove a group (members -> unassigned)
//   { daysOpen: 'current' | ... }        how many day sections open by default
//
// Every shape returns the refreshed groups + per-attendee assignments so the
// panel can swap them in.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const eventId = Number((await params).id);
  const event = Number.isInteger(eventId) ? await getEventById(eventId) : null;
  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);

  async function refreshed(extra: Record<string, unknown> = {}) {
    const [groups, roster] = await Promise.all([listGroups(eventId), listGroupRoster(eventId)]);
    return NextResponse.json({
      groups,
      assignments: roster.map((r) => ({ userId: r.userId, groupId: r.groupId })),
      ...extra,
    });
  }

  if (body?.create && typeof body.create.count === 'number') {
    // Ensure the event has a playlist first (a group always collects songs);
    // idempotent for events that already have one.
    await createGroups(eventId, body.create.count, event.title);
    return refreshed();
  }

  if (body?.addGroup === true) {
    const result = await addGroup(eventId, event.title);
    if (!result.ok) {
      return NextResponse.json(
        { error: 'This event already has the maximum number of groups.' },
        { status: 400 }
      );
    }
    return refreshed();
  }

  if (body?.assign && typeof body.assign.userId === 'number') {
    const groupIdNum = Number(body.assign.groupId);
    const groupId = Number.isInteger(groupIdNum) && groupIdNum > 0 ? groupIdNum : null;
    if (!(await assignAttendeeGroup(eventId, body.assign.userId, groupId))) {
      return NextResponse.json({ error: 'Not an attendee of this event' }, { status: 404 });
    }
    return refreshed();
  }

  if (body?.distribute === true) {
    const assigned = await distributeUnassigned(eventId);
    return refreshed({ assigned });
  }

  if (typeof body?.deleteGroupId === 'number') {
    const result = await deleteGroup(eventId, body.deleteGroupId);
    if (!result.ok) {
      if (result.reason === 'has_posts') {
        const group = await getGroup(body.deleteGroupId);
        const name = group?.name ?? 'This group';
        const posts = result.postCount === 1 ? '1 post' : `${result.postCount} posts`;
        return NextResponse.json(
          {
            error: `${name} has ${posts} on its board and can't be removed. Remove the posts first.`,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    return refreshed({ freed: result.freed });
  }

  if (typeof body?.daysOpen === 'string') {
    if (!DAYS_OPEN_VALUES.includes(body.daysOpen as DaysOpenDefault)) {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 });
    }
    await setDaysOpenDefault(eventId, body.daysOpen as DaysOpenDefault);
    return NextResponse.json({ daysOpen: body.daysOpen });
  }

  return NextResponse.json({ error: 'Nothing to do' }, { status: 400 });
}
