import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

/** Protege rutas: exige sesión activa de Supabase; si no, redirige a /login. */
export const authGuard: CanActivateFn = async () => {
  const sb = inject(SupabaseService);
  const router = inject(Router);
  const { data } = await sb.client.auth.getSession();
  if (data.session) return true;
  return router.parseUrl('/login');
};
