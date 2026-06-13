// Configuración de Supabase para FALM V2.
// La anon/publishable key es pública por diseño (la seguridad la da RLS, no la clave).
export const environment = {
  production: false,
  supabaseUrl: 'https://rgpzrbwpyaewughahpgo.supabase.co',
  supabaseKey: 'sb_publishable_1fUl7M0SF7dLDSMLhJwEuA_DMii7LVI',
  // El schema del proyecto FALM V2 (aislado del public de otras apps)
  dbSchema: 'falm',

  // --- MODO DESARROLLO (para ver la app sin login) ---
  // Inicia sesión anónima automáticamente (rol authenticated -> RLS deja leer).
  devAnonLogin: true,
  // "Mi equipo" se fija a este equipo por nombre (en vez de filtrar por usuario_id).
  // Poner '' para volver al comportamiento normal (equipo del usuario autenticado).
  devEquipoNombre: 'GOLDEN BOYS',
};
