import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

/**
 * Protege /admin: además de tener sesión, hay que ser ADMIN.
 *
 * Ojo con lo que esto es y lo que no: la puerta de verdad está en la base de
 * datos, donde cada función administrativa comprueba el rol. Esto solo evita que
 * alguien entre por curiosidad a una pantalla donde no puede hacer nada, y quita
 * el enlace de en medio. Un guard de Angular vive en el navegador y no protege
 * ningún dato por sí solo.
 */
export const adminGuard: CanActivateFn = async () => {
  const sb = inject(SupabaseService);
  const router = inject(Router);
  const { data } = await sb.client.auth.getSession();
  if (!data.session) return router.parseUrl('/login');
  const { data: esAdmin } = await sb.client.rpc('es_admin');
  return esAdmin === true ? true : router.parseUrl('/dashboard');
};
