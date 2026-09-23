-- Multi-tenant workspaces: the songwriting workspace (Yellow Ostrich) stops
-- being a singleton so another songwriter can have her own pile. Named
-- generically (not band_*) on purpose — a future product could scope Song
-- Club under the same tenancy concept. Songs and groups get a workspace_id;
-- versions, lyrics, and comments inherit scoping through their song.

create table if not exists workspaces (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

-- Fresh identity column ⇒ this seed row is id 1, which the column defaults
-- below rely on (a DDL default can't hold a subquery).
insert into workspaces (slug, name)
values ('yellow-ostrich', 'Yellow Ostrich')
on conflict (slug) do nothing;

create table if not exists workspace_members (
  workspace_id bigint not null references workspaces(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  -- Owners moderate within their workspace (delete anyone's uploads, etc.);
  -- members only touch their own. Birdhaus staff/admin moderate everywhere.
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Everyone with the band role today is a Yellow Ostrich member; those who
-- are also staff seed as owners.
insert into workspace_members (workspace_id, user_id, role)
select w.id,
       ur.user_id,
       case
         when exists (select 1 from user_roles s
                      where s.user_id = ur.user_id and s.role = 'staff')
           then 'owner'
         else 'member'
       end
from user_roles ur
join workspaces w on w.slug = 'yellow-ostrich'
where ur.role = 'band'
on conflict do nothing;

-- default 1 = the yellow-ostrich seed row, so the currently-live code (which
-- doesn't send a workspace) keeps inserting correctly until the new code
-- deploys. New code always sets it explicitly.
alter table band_songs
  add column if not exists workspace_id bigint not null default 1
    references workspaces(id) on delete cascade;

alter table band_song_groups
  add column if not exists workspace_id bigint not null default 1
    references workspaces(id) on delete cascade;

create index if not exists band_songs_workspace_idx on band_songs (workspace_id);
create index if not exists band_song_groups_workspace_idx on band_song_groups (workspace_id);
