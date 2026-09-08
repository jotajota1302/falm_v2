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

/**
 * El reverso: /login no tiene sentido si ya estás dentro. Sin esto, un enlace
 * viejo te pintaba el formulario de entrada dentro de la aplicación, con el
 * menú y todo, y con tu equipo ya cargado detrás.
 */
export const invitadoGuard: CanActivateFn = async () => {
  const sb = inject(SupabaseService);
  const router = inject(Router);
  const { data } = await sb.client.auth.getSession();
  if (!data.session) return true;
  return router.parseUrl('/dashboard');
};
