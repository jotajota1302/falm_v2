import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Login / registro por email contra Supabase Auth. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="wrap">
      <form class="card" (ngSubmit)="submit()">
        <h1>⚽ FALM</h1>
        <p class="sub">{{ modoRegistro() ? 'Crear cuenta' : 'Iniciar sesión' }}</p>

        <label>Email <input type="email" [(ngModel)]="email" name="email" required /></label>
        <label>Contraseña <input type="password" [(ngModel)]="password" name="password" required /></label>

        @if (error()) { <p class="err">{{ error() }}</p> }
        @if (info()) { <p class="info">{{ info() }}</p> }

        <button type="submit" [disabled]="cargando()">
          {{ cargando() ? '…' : (modoRegistro() ? 'Registrarme' : 'Entrar') }}
        </button>
        <button type="button" class="toggle" (click)="modoRegistro.set(!modoRegistro())">
          {{ modoRegistro() ? 'Ya tengo cuenta' : 'Crear una cuenta' }}
        </button>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height:100vh; display:grid; place-items:center; background:#0f172a; }
    .card { background:#fff; padding:28px; border-radius:14px; width:320px; display:flex;
      flex-direction:column; gap:12px; box-shadow:0 10px 30px #0006; }
    h1 { margin:0; text-align:center; }
    .sub { margin:0 0 8px; text-align:center; color:#64748b; }
    label { display:flex; flex-direction:column; gap:4px; font-size:.85rem; color:#334155; }
    input { padding:10px; border:1px solid #cbd5e1; border-radius:8px; font-size:1rem; }
    button { padding:10px; border:none; border-radius:8px; background:#0f172a; color:#fff;
      font-weight:600; cursor:pointer; }
    .toggle { background:none; color:#0f172a; font-weight:500; }
    .err { color:#dc2626; font-size:.85rem; margin:0; }
    .info { color:#16a34a; font-size:.85rem; margin:0; }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  modoRegistro = signal(false);
  cargando = signal(false);
  error = signal('');
  info = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  async submit() {
    this.error.set('');
    this.info.set('');
    this.cargando.set(true);
    try {
      if (this.modoRegistro()) {
        await this.auth.signUp(this.email, this.password);
        this.info.set('Cuenta creada. Revisa tu email si se pide verificación, y entra.');
        this.modoRegistro.set(false);
      } else {
        await this.auth.signIn(this.email, this.password);
        this.router.navigateByUrl('/dashboard');
      }
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error de autenticación');
    } finally {
      this.cargando.set(false);
    }
  }
}
