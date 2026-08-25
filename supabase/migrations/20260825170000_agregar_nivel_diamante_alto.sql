-- Agrega DIAMANTE_ALTO (95-100% de confianza) como nivel de pureza válido,
-- separando el tramo 90-94% (DIAMANTE) del 95-100% (DIAMANTE_ALTO) y el
-- tramo 80-84% (ORO) del 85-89% (ORO_ALTO). Antes ORO/ORO_ALTO y DIAMANTE
-- ya eran valores válidos pero sin un corte exacto documentado; esta
-- migración solo agrega el valor faltante al check constraint.

alter table picks drop constraint if exists picks_nivel_check;
alter table picks add constraint picks_nivel_check
  check (nivel in ('DIAMANTE_ALTO', 'DIAMANTE', 'ORO_ALTO', 'ORO', 'IMPUREZA'));
