import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/**
 * Rutas de FALM V2. Estructura del análisis UX (5 secciones).
 * Por ahora implementadas: Login, Dashboard, Clasificación. El resto se irán añadiendo.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'plantilla',
        loadComponent: () =>
          import('./features/equipo/plantilla.component').then((m) => m.PlantillaComponent),
      },
      {
        path: 'alineacion',
        loadComponent: () =>
          import('./features/equipo/alineacion.component').then((m) => m.AlineacionComponent),
      },
      {
        path: 'mercado',
        loadComponent: () =>
          import('./features/mercado/mercado.component').then((m) => m.MercadoComponent),
      },
      {
        path: 'fichajes',
        loadComponent: () =>
          import('./features/fichajes/fichajes.component').then((m) => m.FichajesComponent),
      },
      {
        path: 'intercambios',
        loadComponent: () =>
          import('./features/fichajes/intercambios.component').then((m) => m.IntercambiosComponent),
      },
      {
        path: 'clasificacion',
        loadComponent: () =>
          import('./features/competicion/clasificacion.component').then(
            (m) => m.ClasificacionComponent
          ),
      },
      {
        path: 'jornadas',
        loadComponent: () =>
          import('./features/competicion/jornadas.component').then((m) => m.JornadasComponent),
      },
      {
        path: 'puntuaciones',
        loadComponent: () =>
          import('./features/estadisticas/puntuaciones.component').then((m) => m.PuntuacionesComponent),
      },
      {
        path: 'premios',
        loadComponent: () =>
          import('./features/competicion/premios.component').then((m) => m.PremiosComponent),
      },
      {
        path: 'admin',
        loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
        children: [
          { path: '', redirectTo: 'pretemporada', pathMatch: 'full' },
          { path: 'pretemporada', loadComponent: () => import('./features/admin/pretemporada.component').then((m) => m.AdminPretemporadaComponent) },
          { path: 'jugadores', loadComponent: () => import('./features/admin/jugadores.component').then((m) => m.AdminJugadoresComponent) },
          { path: 'puntuaciones', loadComponent: () => import('./features/admin/puntuaciones.component').then((m) => m.AdminPuntuacionesComponent) },
          { path: 'operaciones', loadComponent: () => import('./features/admin/operaciones.component').then((m) => m.AdminOperacionesComponent) },
          { path: 'equipos', loadComponent: () => import('./features/admin/equipos.component').then((m) => m.AdminEquiposComponent) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
