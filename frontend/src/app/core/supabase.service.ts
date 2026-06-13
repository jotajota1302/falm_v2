import { Injectable } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

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
    }
  );
}
