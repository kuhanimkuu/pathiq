-- Development seed data, taken from src/data/mockData.js.
-- Coordinates are approximate and several names are placeholders. Replace them
-- with Scout-verified places before launch.

insert into public.gems (name, category, location, status) values
  ('Mama Njeri''s Nyama Choma',           'food',        st_setsrid(st_makepoint(36.7830, -1.2921), 4326)::geography, 'verified'),
  ('24hr fuel + clean washrooms',         'fuel',        st_setsrid(st_makepoint(36.8172, -1.2864), 4326)::geography, 'verified'),
  ('Ngong Hills viewpoint',               'scenic',      st_setsrid(st_makepoint(36.6420, -1.4140), 4326)::geography, 'verified'),
  ('Java House: quiet corner for calls',  'food',        st_setsrid(st_makepoint(36.8020, -1.2660), 4326)::geography, 'verified'),
  ('Total Energies: 24hr, well-lit',      'fuel',        st_setsrid(st_makepoint(36.8000, -1.3050), 4326)::geography, 'verified'),
  ('Karura Forest gate viewpoint',        'scenic',      st_setsrid(st_makepoint(36.8370, -1.2400), 4326)::geography, 'verified'),
  ('Public washrooms: Yaya Centre',       'facilities',  st_setsrid(st_makepoint(36.7876, -1.2937), 4326)::geography, 'verified'),
  ('Nairobi National Museum',             'attractions', st_setsrid(st_makepoint(36.8143, -1.2745), 4326)::geography, 'verified'),
  ('Giraffe Centre',                      'attractions', st_setsrid(st_makepoint(36.7436, -1.3760), 4326)::geography, 'verified'),
  ('Trademark Hotel: Village Market',     'hotels',      st_setsrid(st_makepoint(36.8046, -1.2296), 4326)::geography, 'verified'),
  ('Karen Country Lodge',                 'hotels',      st_setsrid(st_makepoint(36.7100, -1.3290), 4326)::geography, 'verified');

insert into public.road_reports (type, severity, confidence, location, description, status) values
  ('incident',     4, 0.90, st_setsrid(st_makepoint(36.8140, -1.2900), 4326)::geography, 'Accident on Uhuru Highway',  'verified'),
  ('construction', 3, 0.85, st_setsrid(st_makepoint(36.7700, -1.2650), 4326)::geography, 'Road works on Waiyaki Way',  'verified'),
  ('pothole',      3, 0.94, st_setsrid(st_makepoint(36.7770, -1.3010), 4326)::geography, 'Pothole cluster on Ngong Road', 'verified');
