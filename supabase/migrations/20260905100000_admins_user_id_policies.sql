alter table public.admins
add column if not exists user_id uuid references auth.users(id) on delete cascade;

update public.admins
set user_id = auth_users.id
from auth.users as auth_users
where public.admins.user_id is null
  and lower(public.admins.email) = lower(auth_users.email);

delete from public.admins
where user_id is null;

alter table public.admins
alter column user_id set not null;

alter table public.admins
drop constraint if exists admins_pkey;

alter table public.admins
add constraint admins_pkey primary key (user_id);

create unique index if not exists admins_email_unique
on public.admins (lower(email));

drop policy if exists "Admins can read admins" on public.admins;
create policy "Admins can read admins"
on public.admins for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Owners can insert games" on public.games;
create policy "Owners can insert games"
on public.games for insert
to authenticated
with check (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

drop policy if exists "Owners can update games" on public.games;
create policy "Owners can update games"
on public.games for update
to authenticated
using (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

drop policy if exists "Owners can delete games" on public.games;
create policy "Owners can delete games"
on public.games for delete
to authenticated
using (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);
