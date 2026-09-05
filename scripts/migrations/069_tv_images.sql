-- Curated image pool for the in-venue CRT display (/tv). Until now every image
-- on the tube came from show data (tonight's flyer, band photos, upcoming
-- flyers); this table is a standalone folder of images the /tv screen cycles
-- through during idle "dead air" — no show tonight, before doors, after the
-- last set. Managed at /admin/tv-images; images live in the R2 `tv/` folder.
-- Additive only.
create table if not exists tv_images (
  id bigint generated always as identity primary key,
  -- Public R2 URL of the uploaded image (images.thebirdhaus.org/tv/...). The
  -- /tv feed rewrites this to the 640px Pi variant at request time.
  url text not null,
  -- Optional line shown under the image on the tube. null = image only.
  caption text,
  -- Manual display order (ascending); ties break by id. Reordered in the admin.
  sort int not null default 0,
  -- Soft on/off so an image can be parked without deleting it.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
