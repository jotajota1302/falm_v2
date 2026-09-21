import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Si el servidor contesta 401, la sesión ya no vale: caducó, se cerró en otra
 * pestaña o el refresco falló. Hasta ahora eso no se veía —cada pantalla se
 * quedaba vacía o con un error suyo— y había que adivinar que tocaba volver a
 * entrar. Se comprueba aquí, en el `fetch` del cliente, porque así vale para
 * todas las llamadas a la vez, las lea quien las lea y las capture quien las
 * capture.
 *
 * Al login se va con recarga entera y no con el router: con la sesión rota, lo
 * que hay en pantalla ya no se sostiene, y media app con datos de nadie es peor
 * que empezar de cero. Se lleva la ruta de vuelta para volver donde estaba.
 */
function alLoginSiCaduco(respuesta: Response): Response {
  if (respuesta.status !== 401) return respuesta;
  // El propio login y el refresco del token dan 401 cuando la contraseña o el
  // refresh no valen: ahí el error lo enseña la pantalla, no se echa a nadie.
  const ruta = location.pathname;
  if (ruta.startsWith('/login')) return respuesta;
  const vuelta = encodeURIComponent(ruta + location.search);
  location.assign(`/login?vuelve=${vuelta}&caducada=1`);
  return respuesta;
}

/**
 * Cliente único de Supabase. Apunta al schema 'falm' por defecto, de modo que
 * `client.from('v_clasificacion')` resuelve a `falm.v_clasificacion`.
 * Para auth se usa `client.auth` (no depende del schema).
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  // Tipo inferido (con schema 'falm' no encaja el genérico SupabaseClient por defecto)
  readonly client = createClient(
    environment.supabaseUrl,
    environment.supabaseKey,
    {
      db: { schema: environment.dbSchema },
      auth: { persistSession: true, autoRefreshToken: true },
      global: {
        fetch: async (input, init) => {
          const r = await fetch(input as any, init);
          // Lo de auth se deja pasar: un 401 ahí es "esa contraseña no es", y
          // mandarse a uno mismo al login desde el login es un bucle.
          const url = typeof input === 'string' ? input : (input as Request).url ?? '';
          return url.includes('/auth/v1/') ? r : alLoginSiCaduco(r);
        },
      },
    }
  );
}
