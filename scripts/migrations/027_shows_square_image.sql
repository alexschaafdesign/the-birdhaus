-- Track the Square IMAGE object created from a show's flyer, so the sync action
-- can tell whether the flyer still needs attaching (create-once + flyer-later).
alter table shows add column if not exists square_image_id text;
