-- Precios planos y presupuesto de 23 jugadores (2026-09-03).
--
-- Por ahora todos los activos valen lo mismo, así que el draft no premia ni
-- castiga por precio: se elige por criterio deportivo. El presupuesto de cada
-- equipo es exactamente el de sus 23 picks (23 x 15 = 345M), y draft_consolidar
-- lo descuenta, de modo que al acabar el draft cada equipo queda a cero y los
-- movimientos posteriores dependen de premios y ventas.
--
-- Respaldo previo (por si hay que volver atrás):
--   falm._backup_precios_20260903      (id, precio_mercado) de los 860 activos
--   falm._backup_presupuestos_20260903 (id, nombre, presupuesto) de los 10 equipos
--
-- Para revertir:
--   update falm.activo a set precio_mercado = b.precio_mercado
--     from falm._backup_precios_20260903 b where b.id = a.id;
--   update falm.equipo_falm e set presupuesto = b.presupuesto
--     from falm._backup_presupuestos_20260903 b where b.id = e.id;

update falm.activo set precio_mercado = 15;
update falm.equipo_falm set presupuesto = 23 * 15;
