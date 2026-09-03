import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Login por NOMBRE DE EQUIPO + contraseña (Supabase Auth bajo el capó). */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <form class="caja rise" (ngSubmit)="submit()">
        <span class="cab">Liga Fantasy</span>
        <h1>FALM</h1>
        <p class="sub">Entra con el nombre de tu equipo.</p>

        <label>Equipo
          <input type="text" [(ngModel)]="equipo" name="equipo" autocomplete="username"
                 placeholder="GOLDEN BOYS" required />
        </label>

        <label>Contraseña
          <input type="password" [(ngModel)]="password" name="password"
                 autocomplete="current-password" required />
        </label>

        @if (error()) { <p class="err">{{ error() }}</p> }

        <button type="submit" [disabled]="cargando()">{{ cargando() ? 'Entrando…' : 'Entrar' }}</button>
        <p class="hint">Provisional: la contraseña es el nombre de tu equipo.</p>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
    .caja { width: 360px; max-width: 100%; padding: 32px 28px; display: flex; flex-direction: column; gap: 14px;
      background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
    /* Cabecera de portada: antetítulo, cabecera y entradilla. */
    .cab { font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }
    h1 { font-size: 42px; margin: -2px 0 0; }
    .sub { margin: 0 0 8px; color: var(--text2); font-size: 13.5px; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 9px; text-transform: uppercase;
      letter-spacing: .16em; color: var(--text2); font-weight: 700; }
    input { width: 100%; text-transform: none; letter-spacing: normal; }
    button[type=submit] { padding: 13px; border: none; border-radius: 11px; background: var(--accent);
      color: var(--accent-ink); font-family: var(--fb); font-weight: 700; cursor: pointer; font-size: 14px; margin-top: 4px; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .err { color: var(--bad); font-size: 13px; margin: 0; }
    .hint { margin: 2px 0 0; color: var(--text2); font-size: 11.5px; }
  `],
})
export class LoginComponent {
  equipo = '';
  password = '';
  cargando = signal(false);
  error = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  async submit() {
    this.error.set('');
    if (!this.equipo.trim()) { this.error.set('Pon el nombre de tu equipo.'); return; }
    if (!this.password) { this.error.set('Pon la contraseña.'); return; }
    this.cargando.set(true);
    try {
      await this.auth.loginEquipo(this.equipo, this.password);
      this.router.navigateByUrl('/dashboard');
    } catch (e: any) {
      // Supabase responde 'Invalid login credentials'; en castellano y sin pistas de si
      // lo que falla es el equipo o la contraseña.
      const msg = String(e?.message ?? '');
      this.error.set(/invalid login credentials/i.test(msg)
        ? 'Equipo o contraseña incorrectos.'
        : (msg || 'Error al entrar'));
    } finally {
      this.cargando.set(false);
    }
  }
}
