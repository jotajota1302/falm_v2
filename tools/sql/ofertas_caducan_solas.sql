-- Las ofertas de intercambio no se podian crear.
--
-- falm.oferta_intercambio.fecha_expiracion es NOT NULL y no tenia default, y
-- nadie se la ponia: ni la app -crearOferta manda oferente, receptor, estado y
-- comentario, y su comentario dice "Expira a 7 dias" sin llegar a escribirlo-
-- ni un trigger, que no habia. Asi que cada intento de ofertar moria con
--
--   null value in column "fecha_expiracion" violates not-null constraint
--
-- La tabla tiene cero filas desde que existe, y eso parecia una funcionalidad
-- poco usada. No lo era: estaba rota.
--
-- El plazo se pone como DEFAULT de la columna y no en la app, que es donde
-- viven el resto de las reglas de esta liga: asi vale igual para la pantalla,
-- para el panel y para un insert a mano, y la app no tiene que saberselo.

alter table falm.oferta_intercambio
  alter column fecha_expiracion set default (now() + interval '7 days');

comment on column falm.oferta_intercambio.fecha_expiracion is
  'Cuando deja de poder aceptarse. Por defecto 7 dias. Quien manda de verdad es '
  'falm.oferta_responder, que la comprueba al aceptar; el cron solo repinta el '
  'estado a EXPIRADA para que la pantalla no ofrezca un boton muerto.';

-- El cron pasa de cada hora a una vez al dia: la regla la aplica
-- oferta_responder al aceptar, asi que esto solo repinta la etiqueta. Y para
-- que la pantalla no mienta entre pasada y pasada, Intercambios se mira la
-- fecha y no el estado guardado.
--
--   select cron.alter_job((select jobid from cron.job where jobname = 'falm-expirar-ofertas'),
--                         schedule => '30 4 * * *');
