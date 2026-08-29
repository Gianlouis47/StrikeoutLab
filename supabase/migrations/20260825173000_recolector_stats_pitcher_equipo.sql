-- Recolector de estadísticas reales (K%, Whiff%, CSW%, SwStr%, K/9, WHIP, IP,
-- correa del mánager) de pitchers, y splits de equipo (K%, swing%, chase%)
-- vs derechos/zurdos. Alimentado por la IA cuando busca en FanGraphs,
-- MLB.com o Linemate durante analizar-pitcher — nunca por invención: solo
-- números que la IA efectivamente encontró y citó con fuente.
--
-- Esto es un recolector, no una fórmula: la clasificación Oro/Diamante
-- sigue siendo JUICIO de la IA sintetizando estos datos junto al resto del
-- contexto, no una suma ponderada automática de estas columnas.

create table if not exists pitcher_stats_snapshot (
  id uuid primary key default gen_random_uuid(),
  pitcher text not null,
  fecha_corte date not null,
  k_pct numeric,
  whiff_pct numeric,
  csw_pct numeric,
  swstr_pct numeric,
  k_9 numeric,
  whip numeric,
  ip numeric,
  correa_pitcheos_promedio numeric,
  correa_nota text,
  fuente text,
  created_at timestamptz not null default now(),
  unique (pitcher, fecha_corte)
);

create table if not exists equipo_stats_split (
  id uuid primary key default gen_random_uuid(),
  equipo text not null,
  ventana text not null check (ventana in ('TEMPORADA','ULTIMOS_14')),
  vs_mano text not null check (vs_mano in ('RHP','LHP')),
  k_pct numeric,
  swing_pct numeric,
  chase_pct numeric,
  fecha_corte date not null,
  fuente text,
  created_at timestamptz not null default now(),
  unique (equipo, ventana, vs_mano, fecha_corte)
);

alter table pitcher_stats_snapshot enable row level security;
alter table equipo_stats_split enable row level security;

create policy "usuario_autenticado_todo_pitcher_stats_snapshot" on pitcher_stats_snapshot
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "usuario_autenticado_todo_equipo_stats_split" on equipo_stats_split
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
