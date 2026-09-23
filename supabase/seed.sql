-- Development seed data, taken from src/data/mockData.js.
-- Coordinates are approximate and several names are placeholders. Replace them
-- with Scout-verified places before launch.

-- postgis lives in the "extensions" schema (see the init migration). The
-- connection `supabase db push --include-seed` uses against a hosted project
-- doesn't have it on its search_path — a `set search_path` at the top of this
-- file doesn't survive whatever batching the CLI does — so every postgis name
-- is schema-qualified explicitly. None of this is needed for
-- `supabase db reset` locally (its search_path already includes extensions),
-- but it's harmless there too.

insert into public.gems (name, category, location, status) values
  ('Mama Njeri''s Nyama Choma',           'food',        extensions.st_setsrid(extensions.st_makepoint(36.7830, -1.2921), 4326)::extensions.geography, 'verified'),
  ('24hr fuel + clean washrooms',         'fuel',        extensions.st_setsrid(extensions.st_makepoint(36.8172, -1.2864), 4326)::extensions.geography, 'verified'),
  ('Ngong Hills viewpoint',               'scenic',      extensions.st_setsrid(extensions.st_makepoint(36.6420, -1.4140), 4326)::extensions.geography, 'verified'),
  ('Java House: quiet corner for calls',  'food',        extensions.st_setsrid(extensions.st_makepoint(36.8020, -1.2660), 4326)::extensions.geography, 'verified'),
  ('Total Energies: 24hr, well-lit',      'fuel',        extensions.st_setsrid(extensions.st_makepoint(36.8000, -1.3050), 4326)::extensions.geography, 'verified'),
  ('Karura Forest gate viewpoint',        'scenic',      extensions.st_setsrid(extensions.st_makepoint(36.8370, -1.2400), 4326)::extensions.geography, 'verified'),
  ('Public washrooms: Yaya Centre',       'facilities',  extensions.st_setsrid(extensions.st_makepoint(36.7876, -1.2937), 4326)::extensions.geography, 'verified'),
  ('Nairobi National Museum',             'attractions', extensions.st_setsrid(extensions.st_makepoint(36.8143, -1.2745), 4326)::extensions.geography, 'verified'),
  ('Giraffe Centre',                      'attractions', extensions.st_setsrid(extensions.st_makepoint(36.7436, -1.3760), 4326)::extensions.geography, 'verified'),
  ('Trademark Hotel: Village Market',     'hotels',      extensions.st_setsrid(extensions.st_makepoint(36.8046, -1.2296), 4326)::extensions.geography, 'verified'),
  ('Karen Country Lodge',                 'hotels',      extensions.st_setsrid(extensions.st_makepoint(36.7100, -1.3290), 4326)::extensions.geography, 'verified');

insert into public.road_reports (type, severity, confidence, location, description, status) values
  ('incident',     4, 0.90, extensions.st_setsrid(extensions.st_makepoint(36.8140, -1.2900), 4326)::extensions.geography, 'Accident on Uhuru Highway',  'verified'),
  ('construction', 3, 0.85, extensions.st_setsrid(extensions.st_makepoint(36.7700, -1.2650), 4326)::extensions.geography, 'Road works on Waiyaki Way',  'verified'),
  ('pothole',      3, 0.94, extensions.st_setsrid(extensions.st_makepoint(36.7770, -1.3010), 4326)::extensions.geography, 'Pothole cluster on Ngong Road', 'verified');
