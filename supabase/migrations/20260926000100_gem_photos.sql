-- Scouts can attach a photo to a gem discovery, as they already can to a road
-- report (features.md: "Submit a report with photo and GPS"). Same private
-- scout-photos bucket and policies: <user id>/<file>, readable by the
-- uploader and admins.

alter table public.gems add column photo_path text;
