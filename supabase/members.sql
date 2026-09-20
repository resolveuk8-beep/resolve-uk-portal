-- Gives the people you created in Authentication > Users their place in the portal.
--
-- Before running this:
--   1. In Supabase, go to Authentication > Users > Add user > Create new user.
--      Create one user for you and one for Ms Kay. Tick "Auto Confirm User".
--   2. Replace the two email addresses below with the same addresses you just used.
--   3. Run this in the SQL editor. It is safe to run again.
--
-- Roles:  owner = you (edits everything).  client = Ms Kay (answers, comments, reads).
--         viewer = read-only, for anyone added later.

insert into public.profiles (id, display_name, role)
select id, 'Ivhel', 'owner' from auth.users where email = 'REPLACE-WITH-YOUR-EMAIL'
on conflict (id) do update set display_name = excluded.display_name, role = excluded.role;

insert into public.profiles (id, display_name, role)
select id, 'Kay French', 'client' from auth.users where email = 'REPLACE-WITH-KAYS-EMAIL'
on conflict (id) do update set display_name = excluded.display_name, role = excluded.role;

-- To add someone later (read-only), create their user first, then:
--   insert into public.profiles (id, display_name, role)
--   select id, 'Their Name', 'viewer' from auth.users where email = 'their-email';

-- Check: this should list both people with the right role.
select p.display_name, p.role, u.email
from public.profiles p join auth.users u on u.id = p.id
order by p.role;
