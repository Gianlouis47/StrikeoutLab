-- Registro de la migración ya aplicada al proyecto. La base es la fuente de
-- verdad; este archivo existe para poder leer en el repo qué cambió y por qué.
--
-- EL AGUJERO
--
-- Las siete tablas de datos tenían una política `FOR ALL` cuya condición era
-- `auth.role() = 'authenticated'`. O sea: alcanzaba con estar registrado.
-- Mientras la app era un APK en un solo teléfono eso no molestaba a nadie. Al
-- ponerla en una URL pública de Vercel se vuelve otra cosa: cualquiera que
-- encontrara el link, se registrara y abriera la consola del navegador tenía
-- INSERT, UPDATE y DELETE sobre todo. Un `delete from game_logs` se llevaba
-- las 3.658 salidas que costaron dos días de carga desde la API de la MLB.
--
-- LA SOLUCIÓN
--
-- Lista blanca. Estar registrado ya no alcanza: hay que estar en
-- usuarios_permitidos. Esa tabla solo tiene política de SELECT de la fila
-- propia, así que desde el cliente no se puede escribir — nadie se agrega
-- solo. Se da de alta gente desde el editor SQL de Supabase, a mano.
--
-- Se eligió lista blanca y no una columna `user_id` en cada tabla porque los
-- datos no son "de un usuario": game_logs son los ponches reales de la MLB,
-- team_k son los splits de los 30 equipos. Son datos compartidos con un solo
-- dueño, no datos por usuario. Meter un user_id en cada fila habría sido
-- modelar una multi-tenencia que no existe.
--
-- LA EDGE FUNCTION NO SE VE AFECTADA: `chat` usa SUPABASE_SERVICE_ROLE_KEY,
-- que pasa por encima de RLS.
--
-- VERIFICADO haciéndose pasar por cada uno con set_config de request.jwt.claims:
--
--   dueño (gianlouisantonio)      3.658 game_logs, 14 picks, 9,7 ms
--   registrado fuera de la lista  0 filas, 0 picks
--
--   INSERT en game_logs .................. BLOQUEADO por la política
--   DELETE de todo game_logs ............. 0 filas borradas
--   Auto-agregarse a la lista blanca ..... BLOQUEADO por la política

create table if not exists usuarios_permitidos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nota text,
  creado_en timestamptz not null default now()
);

alter table usuarios_permitidos enable row level security;

drop policy if exists usuarios_permitidos_se_ve_a_si_mismo on usuarios_permitidos;
create policy usuarios_permitidos_se_ve_a_si_mismo on usuarios_permitidos
  for select to authenticated
  using (user_id = (select auth.uid()));

-- SECURITY DEFINER para que pueda leer la lista blanca sin quedar atrapada en
-- el RLS de la propia tabla que consulta.
create or replace function public.es_duenio()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.usuarios_permitidos u where u.user_id = auth.uid())
$$;

revoke all on function public.es_duenio() from public;
grant execute on function public.es_duenio() to authenticated;

-- En las políticas va envuelta en (select ...) para que Postgres la evalúe UNA
-- vez por consulta y no una vez por fila. Sin eso, un scan de game_logs la
-- llamaría 3.658 veces y el backtest, millones — que es exactamente la clase
-- de regresión que ya se cometió una vez metiendo backtest_ponches() adentro
-- de calibracion_real.
do $$
declare t text;
begin
  foreach t in array array[
    'picks', 'game_logs', 'team_k', 'equipo_stats_split',
    'pitcher_stats_snapshot', 'learning_log', 'analisis_fotos'
  ] loop
    execute format('drop policy if exists %I on %I', 'usuario_autenticado_todo_' || t, t);
    execute format('drop policy if exists %I on %I', t || '_solo_duenio', t);
    execute format(
      'create policy %I on %I for all to authenticated using ((select public.es_duenio())) with check ((select public.es_duenio()))',
      t || '_solo_duenio', t
    );
  end loop;
end $$;

-- equipos_mlb y equipos_alias quedan como estaban (SELECT para cualquier
-- autenticado): son las abreviaturas de los 30 equipos de la MLB, información
-- pública, y de solo lectura.

-- crawlerrobo@gmail.com queda AFUERA a propósito: existe como usuario pero
-- nunca inició sesión, así que no hay forma de saber si es una cuenta del
-- dueño o de otra persona. Si es suya se agrega igual que cualquier otro.
insert into usuarios_permitidos (user_id, nota)
select id, 'dueño de la app' from auth.users where email = 'gianlouisantonio@gmail.com'
on conflict (user_id) do nothing;
