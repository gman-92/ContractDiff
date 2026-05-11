-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  comparisons_used_this_month integer not null default 0,
  comparisons_reset_at timestamptz not null default now(),
  credits integer not null default 0,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- Comparisons table
create table if not exists comparisons (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  contract_a_url text not null,
  contract_b_url text not null,
  contract_a_name text,
  contract_b_name text,
  result_json jsonb,
  status text not null default 'done' check (status in ('pending', 'processing', 'done', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

-- RLS: profiles
alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- RLS: comparisons
alter table comparisons enable row level security;

create policy "Users can read own comparisons"
  on comparisons for select
  using (auth.uid() = user_id);

create policy "Users can insert own comparisons"
  on comparisons for insert
  with check (auth.uid() = user_id);

-- Auto-create profile on sign up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Monthly reset function (call via cron job)
create or replace function reset_monthly_comparisons()
returns void language plpgsql security definer as $$
begin
  update profiles
  set comparisons_used_this_month = 0,
      comparisons_reset_at = now()
  where comparisons_reset_at < now() - interval '1 month';
end;
$$;
