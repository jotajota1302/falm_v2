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
        path: 'clasificacion',
        loadComponent: () =>
          import('./features/competicion/clasificacion.component').then(
            (m) => m.ClasificacionComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
