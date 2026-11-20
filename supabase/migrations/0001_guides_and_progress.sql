-- Guías y progreso de usuarios
create table game_guides (
  igdb_id text primary key,
  manifest jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table completed_steps (
  user_id uuid references auth.users(id) on delete cascade,
  step_id text not null,
  igdb_id text,
  created_at timestamptz default now(),
  primary key (user_id, step_id)
);

-- RLS recomendado
alter table completed_steps enable row level security;
create policy "users manage own steps" on completed_steps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table game_guides enable row level security;
create policy "anyone can read guides" on game_guides for select using (true);
-- Las escrituras pasan por /api/admin/upload-guide con la service role key
