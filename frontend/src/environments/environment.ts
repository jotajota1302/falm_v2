// Configuración de Supabase para FALM V2.
// La anon/publishable key es pública por diseño (la seguridad la da RLS, no la clave).
export const environment = {
  production: false,
  supabaseUrl: 'https://rgpzrbwpyaewughahpgo.supabase.co',
  supabaseKey: 'sb_publishable_1fUl7M0SF7dLDSMLhJwEuA_DMii7LVI',
  // El schema del proyecto FALM V2 (aislado del public de otras apps)
  dbSchema: 'falm',

  // --- LOGIN REAL ACTIVO ---
  // Sin sesión anónima: cada usuario entra con su equipo + contraseña.
  devAnonLogin: false,
  // Vacío -> "Mi equipo" se resuelve por el usuario autenticado (usuario_id).
  devEquipoNombre: '',
};
