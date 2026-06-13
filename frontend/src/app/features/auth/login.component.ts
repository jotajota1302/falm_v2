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
      <form class="card rise" (ngSubmit)="submit()">
        <div class="brand"><span class="ball">⚽</span> FALM</div>
        <p class="sub">Inicia sesión con tu equipo</p>

        <label>Equipo
          <input type="text" [(ngModel)]="equipo" name="equipo" autocomplete="off"
                 placeholder="GOLDEN BOYS" required />
        </label>

        @if (error()) { <p class="err">{{ error() }}</p> }

        <button type="submit" [disabled]="cargando()">{{ cargando() ? '…' : 'Entrar' }}</button>
        <p class="hint">Provisional: entra con el nombre de tu equipo (sin contraseña).</p>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
    .card { width: 340px; max-width: 100%; padding: 30px 26px; display: flex; flex-direction: column; gap: 14px; }
    .brand { font-weight: 900; font-size: 1.7rem; text-align: center; letter-spacing: -.04em; }
    .brand .ball { filter: drop-shadow(0 0 8px var(--glow)); }
    .sub { margin: 0 0 6px; text-align: center; color: var(--muted); font-size: .88rem; }
    label { display: flex; flex-direction: column; gap: 5px; font-size: .76rem; text-transform: uppercase;
      letter-spacing: .04em; color: var(--faint); font-weight: 700; }
    input { padding: 12px 14px; border: 1px solid var(--border); border-radius: 11px; font-size: 1rem;
      background: var(--surface-2); color: var(--ink); text-transform: none; }
    input:focus { outline: none; border-color: var(--primary); }
    button[type=submit] { padding: 13px; border: none; border-radius: 12px; background: var(--primary);
      color: var(--primary-ink); font-weight: 800; cursor: pointer; font-size: 1rem; margin-top: 4px; }
    button:disabled { opacity: .6; }
    .err { color: var(--bad); font-size: .85rem; margin: 0; }
    .hint { margin: 4px 0 0; text-align: center; color: var(--faint); font-size: .74rem; }
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
    this.cargando.set(true);
    try {
      await this.auth.loginNombre(this.equipo);
      this.router.navigateByUrl('/dashboard');
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error al entrar');
    } finally {
      this.cargando.set(false);
    }
  }
}
