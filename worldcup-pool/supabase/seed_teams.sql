-- ============================================================
--  SEED: all 48 teams of the 2026 FIFA World Cup
--  Run after schema.sql. Group letters left blank — fill them
--  in later with:  update teams set grp='A' where name='Mexico';
-- ============================================================
insert into public.teams (name, confederation) values
  -- CONMEBOL
  ('Argentina','CONMEBOL'), ('Brazil','CONMEBOL'), ('Colombia','CONMEBOL'),
  ('Ecuador','CONMEBOL'), ('Paraguay','CONMEBOL'), ('Uruguay','CONMEBOL'),
  -- CONCACAF
  ('United States','CONCACAF'), ('Canada','CONCACAF'), ('Mexico','CONCACAF'),
  ('Curaçao','CONCACAF'), ('Haiti','CONCACAF'), ('Panama','CONCACAF'),
  -- AFC
  ('Australia','AFC'), ('Iran','AFC'), ('Japan','AFC'), ('Jordan','AFC'),
  ('South Korea','AFC'), ('Qatar','AFC'), ('Saudi Arabia','AFC'),
  ('Uzbekistan','AFC'), ('Iraq','AFC'),
  -- CAF
  ('Algeria','CAF'), ('Cabo Verde','CAF'), ('Côte d''Ivoire','CAF'),
  ('Egypt','CAF'), ('Ghana','CAF'), ('Morocco','CAF'), ('Senegal','CAF'),
  ('South Africa','CAF'), ('Tunisia','CAF'), ('DR Congo','CAF'),
  -- OFC
  ('New Zealand','OFC'),
  -- UEFA
  ('England','UEFA'), ('France','UEFA'), ('Croatia','UEFA'), ('Norway','UEFA'),
  ('Portugal','UEFA'), ('Germany','UEFA'), ('Netherlands','UEFA'), ('Austria','UEFA'),
  ('Belgium','UEFA'), ('Scotland','UEFA'), ('Spain','UEFA'), ('Switzerland','UEFA'),
  ('Sweden','UEFA'), ('Türkiye','UEFA'), ('Bosnia and Herzegovina','UEFA'), ('Czechia','UEFA')
on conflict (name) do nothing;
