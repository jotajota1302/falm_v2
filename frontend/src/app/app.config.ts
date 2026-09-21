import { APP_INITIALIZER, ApplicationConfig, ErrorHandler } from '@angular/core';
import { provideRouter, withNavigationErrorHandler } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { RecargaAlPublicar, esTrozoQueYaNoEsta, recargarUnaVez } from './core/recarga-al-publicar';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      // Al cambiar de pantalla es cuando se pide el trozo que ya no existe:
      // el fallo no pasa por el ErrorHandler, lo recoge el router.
      withNavigationErrorHandler((e) => {
        if (esTrozoQueYaNoEsta((e as any)?.error ?? e)) recargarUnaVez();
      }),
    ),
    { provide: ErrorHandler, useClass: RecargaAlPublicar },
    // Garantiza una sesión (anónima en dev) antes de renderizar las rutas.
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [AuthService],
      useFactory: (auth: AuthService) => () => auth.ensureSession(),
    },
  ],
};
