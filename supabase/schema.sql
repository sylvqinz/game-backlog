create table if not exists public.games (
  id text primary key,
  title text not null,
  status text not null check (status in ('todo', 'playing', 'done')),
  completed_once boolean not null default false,
  support text not null default '',
  platform text not null,
  platforms text[] not null default '{}',
  priority text not null check (priority in ('low', 'medium', 'high')),
  personal_rating integer check (personal_rating is null or personal_rating between 0 and 10),
  personal_note text not null default '',
  cover text not null default '',
  description text not null default '',
  released text not null default '',
  genres text[] not null default '{}',
  developer text not null default '',
  publisher text not null default '',
  rawg_url text,
  owner_email text,
  created_at timestamptz not null default now()
);

alter table public.games add column if not exists platforms text[] not null default '{}';
update public.games set platforms = array[platform] where platforms = '{}';
alter table public.games add column if not exists completed_once boolean not null default false;
update public.games set completed_once = true where status in ('done', 'replay');
alter table public.games add column if not exists support text not null default '';
update public.games set support = platform where support = '';
update public.games set support = '' where support = 'Non défini';

alter table public.games drop constraint if exists games_status_check;
update public.games set status = 'todo' where status in ('paused', 'abandoned');
update public.games set status = 'todo' where status = 'replay';
alter table public.games add constraint games_status_check
check (status in ('todo', 'playing', 'done'));

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null
);

create unique index if not exists admins_email_unique
on public.admins (lower(email));

alter table public.games enable row level security;
alter table public.admins enable row level security;

drop policy if exists "Admins can read admins" on public.admins;
create policy "Admins can read admins"
on public.admins for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Anyone can read games" on public.games;
create policy "Anyone can read games"
on public.games for select
using (true);

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

-- Remplace l'adresse puis lance la ligne une fois dans l'éditeur SQL Supabase.
-- insert into public.admins (user_id, email)
-- select id, email from auth.users where email = 'toi@example.com';
