-- StrikeoutLab: esquema inicial
-- Mismo modelo de datos que el sistema original (picks, game_logs, team_k),
-- con las reglas de negocio criticas aplicadas a nivel de base de datos:
-- resultado siempre se deriva de resultado_k (nunca se escribe a mano),
-- y un empate en linea entera nunca colapsa en GANO ni PERDIO.
--
-- Esta migracion ya fue aplicada al proyecto de Supabase "strikeoutlab"
-- via MCP; este archivo la deja versionada en el repo para poder
-- reproducirla (supabase db push) o auditarla.

create extension if not exists pgcrypto;

create table if not exists team_k (
  id uuid primary key default gen_random_uuid(),
  equipo text not null,
  ventana text not null check (ventana in ('TEMPORADA','ULTIMOS_14')),
  k integer not null check (k >= 0),
  pa integer not null check (pa > 0),
  fecha_corte date not null,
  created_at timestamptz not null default now(),
  unique (equipo, ventana, fecha_corte)
);

create table if not exists game_logs (
  id uuid primary key default gen_random_uuid(),
  pitcher text not null,
  fecha date not null,
  rival text not null,
  ip numeric not null check (ip >= 0),
  k integer not null check (k >= 0),
  bb integer not null check (bb >= 0),
  pitcheos integer check (pitcheos is null or pitcheos >= 0),
  created_at timestamptz not null default now(),
  unique (pitcher, fecha, rival)
);

create table if not exists picks (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  codigo text,
  pitcher text not null,
  equipo text not null,
  rival text not null,
  linea numeric not null check (linea >= 0),
  pick text not null check (pick in ('OVER','UNDER')),
  confianza numeric not null check (confianza >= 0 and confianza <= 1),
  nivel text not null check (nivel in ('DIAMANTE','ORO_ALTO','ORO','IMPUREZA')),
  fuente_confianza text not null check (fuente_confianza in ('CALCULADA','JUICIO')),
  motivo text,
  resultado_k integer check (resultado_k is null or resultado_k >= 0),
  resultado text check (resultado in ('GANO','PERDIO','EMPATE')),
  ticket_id text,
  stake numeric check (stake is null or stake >= 0),
  payout numeric check (payout is null or payout >= 0),
  created_at timestamptz not null default now()
);

-- ip_a_decimal: notacion de beisbol (outs) -> decimal real. 5.1 -> 5.3333, 5.2 -> 5.6667
create or replace function ip_a_decimal(ip numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  entero numeric := floor(ip);
  resto numeric := round(ip - entero, 1);
begin
  if resto = 0.0 then
    return entero;
  elsif resto = 0.1 then
    return entero + 1.0/3.0;
  elsif resto = 0.2 then
    return entero + 2.0/3.0;
  else
    raise exception 'ip invalido: %. El decimal debe ser .0, .1 o .2 (notacion de innings)', ip;
  end if;
end;
$$;

-- evaluar_pick: misma regla de negocio del sistema original.
-- Un resultado igual a una linea entera es EMPATE, nunca GANO ni PERDIO.
create or replace function evaluar_pick(k integer, linea numeric, pick text)
returns text
language plpgsql
immutable
as $$
begin
  if pick not in ('OVER','UNDER') then
    raise exception 'pick debe ser OVER o UNDER, recibido: %', pick;
  end if;

  if linea = floor(linea) and k = linea then
    return 'EMPATE';
  end if;

  if pick = 'OVER' then
    return case when k > linea then 'GANO' else 'PERDIO' end;
  else
    return case when k < linea then 'GANO' else 'PERDIO' end;
  end if;
end;
$$;

-- resultado siempre derivado por trigger: nunca se escribe a mano, ni por error
create or replace function trg_derivar_resultado()
returns trigger
language plpgsql
as $$
begin
  if new.resultado_k is null then
    new.resultado := null;
  else
    new.resultado := evaluar_pick(new.resultado_k, new.linea, new.pick);
  end if;
  return new;
end;
$$;

drop trigger if exists derivar_resultado on picks;
create trigger derivar_resultado
before insert or update on picks
for each row
execute function trg_derivar_resultado();

-- Bitacora de aprendizaje (skill 13 del framework), ahora como tabla viva
create table if not exists learning_log (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  descubrimiento text not null,
  fuente text,
  regla_nueva text,
  por_que_importa text,
  cambio_al_framework text,
  estado text not null default 'PROPUESTO' check (estado in ('PROPUESTO','ACTIVO','RETIRADO')),
  created_at timestamptz not null default now()
);

-- Fotos analizadas por el modelo de vision (ticket de Star Sport, captura de stats, etc.)
create table if not exists analisis_fotos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  tipo text,
  modelo_usado text,
  datos_extraidos jsonb,
  pick_id uuid references picks(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_picks_pitcher on picks(pitcher);
create index if not exists idx_picks_resultado on picks(resultado);
create index if not exists idx_game_logs_pitcher_fecha on game_logs(pitcher, fecha desc);
create index if not exists idx_team_k_equipo_ventana on team_k(equipo, ventana);

-- RLS: app de un solo usuario. El anon/publishable key va empacado en la
-- app (es publico por diseno en Supabase); la proteccion real es exigir
-- sesion autenticada.
alter table picks enable row level security;
alter table game_logs enable row level security;
alter table team_k enable row level security;
alter table learning_log enable row level security;
alter table analisis_fotos enable row level security;

create policy "usuario_autenticado_todo_picks" on picks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "usuario_autenticado_todo_game_logs" on game_logs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "usuario_autenticado_todo_team_k" on team_k
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "usuario_autenticado_todo_learning_log" on learning_log
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "usuario_autenticado_todo_analisis_fotos" on analisis_fotos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
