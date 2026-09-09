import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { Equipo, FalmService } from '../../core/falm.service';

/**
 * Mi cuenta: cambiar la contraseña y dejar un correo.
 *
 * No enseña la contraseña, y no es un olvido: Supabase guarda un hash bcrypt,
 * así que no la tiene ni ella. Lo que hace falta de verdad es poder cambiarla.
 *
 * El correo todavía no es el de acceso -ese sigue siendo el sintético con el
 * que se crearon los usuarios-; se guarda como contacto hasta que haya SMTP y
 * se pueda encender la recuperación por enlace.
 */
@Component({
  selector: 'app-cuenta',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="phead">
      <div>
        <h1>Mi cuenta</h1>
        <p class="sub">{{ equipo()?.nombre ?? 'Cargando…' }}</p>
      </div>
    </header>

    @if (aviso()) { <p class="ok">{{ aviso() }}</p> }
    @if (error()) { <p class="err">{{ error() }}</p> }

    <div class="cols">
      <section class="card caja">
        <h2>Cambiar la contraseña</h2>
        <p class="nota">
          Nadie puede verla, tampoco nosotros: se guarda cifrada de una sola dirección.
          Si no te acuerdas de la tuya, pídele al gestor que te ponga una nueva.
        </p>

        <label class="campo">
          <span>Nueva contraseña</span>
          <input type="password" autocomplete="new-password" [ngModel]="p1()"
                 (ngModelChange)="p1.set($event); error.set('')" />
        </label>
        <label class="campo">
          <span>Repítela</span>
          <input type="password" autocomplete="new-password" [ngModel]="p2()"
                 (ngModelChange)="p2.set($event); error.set('')" />
        </label>

        <!-- El motivo por el que no se puede enviar, dicho antes de intentarlo. -->
        @if (motivoPass(); as m) { <p class="pega">{{ m }}</p> }

        <button class="btn" [disabled]="!!motivoPass() || guardandoPass()" (click)="cambiar()">
          {{ guardandoPass() ? 'Guardando…' : 'Cambiar contraseña' }}
        </button>
      </section>

      <section class="card caja">
        <h2>Tu correo</h2>
        <p class="nota">
          Todavía no sirve para entrar: entras con el nombre del equipo, como siempre.
          Se guarda para poder avisarte, y para que el día que activemos el
          «he olvidado la contraseña» te llegue a ti el enlace.
        </p>

        <label class="campo">
          <span>Correo</span>
          <input type="email" autocomplete="email" placeholder="tucorreo@ejemplo.com"
                 [ngModel]="email()" (ngModelChange)="email.set($event); error.set('')" />
        </label>

        <div class="acc">
          <button class="btn" [disabled]="guardandoMail()" (click)="guardarCorreo()">
            {{ guardandoMail() ? 'Guardando…' : 'Guardar correo' }}
          </button>
          @if (equipo()?.emailContacto) {
            <button class="btn-sec" [disabled]="guardandoMail()" (click)="email.set(''); guardarCorreo()">
              Quitarlo
            </button>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
    .caja { padding: 18px 20px; }
    h2 { margin: 0 0 8px; font-family: var(--fh); font-size: var(--t-lg); font-weight: 600; }
    .nota { margin: 0 0 14px; color: var(--text2); font-size: var(--t-sm); }
    .campo { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .campo span { font-size: var(--t-xs); text-transform: uppercase; letter-spacing: .16em;
      color: var(--text2); font-weight: 700; }
    .campo input { width: 100%; }
    .pega { margin: 0 0 12px; color: var(--por); font-size: var(--t-sm); }
    .acc { display: flex; gap: 8px; flex-wrap: wrap; }
    .ok { background: color-mix(in oklab, var(--good) 9%, var(--surface));
      border: 1px solid color-mix(in oklab, var(--good) 34%, var(--line));
      color: var(--good); padding: 11px 14px; border-radius: var(--r-sm); margin-bottom: 14px; }
    .err { color: var(--bad); margin-bottom: 14px; }
    .btn:disabled { opacity: .45; cursor: not-allowed; }

    @media (max-width: 760px) { .cols { grid-template-columns: 1fr; } }
  `],
})
export class CuentaComponent implements OnInit {
  equipo = signal<Equipo | null>(null);
  email = signal('');
  p1 = signal('');
  p2 = signal('');
  guardandoPass = signal(false);
  guardandoMail = signal(false);
  aviso = signal('');
  error = signal('');

  /** Por qué no se puede enviar todavía; null si ya se puede. */
  motivoPass = computed(() => {
    if (!this.p1()) return null;                       // aún no ha escrito nada
    if (this.p1().length < 8) return 'Al menos 8 caracteres.';
    if (this.p2() && this.p1() !== this.p2()) return 'Las dos no coinciden.';
    if (!this.p2()) return 'Repite la contraseña.';
    return null;
  });

  constructor(private auth: AuthService, private falm: FalmService) {}

  async ngOnInit() {
    try {
      const eq = await this.falm.miEquipo();
      this.equipo.set(eq);
      this.email.set(eq?.emailContacto ?? '');
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se ha podido cargar tu equipo');
    }
  }

  async cambiar() {
    this.aviso.set(''); this.error.set('');
    if (this.motivoPass() || !this.p1()) return;
    this.guardandoPass.set(true);
    try {
      await this.auth.cambiarPassword(this.p1());
      this.p1.set(''); this.p2.set('');
      this.aviso.set('Contraseña cambiada. La próxima vez que entres, usa la nueva.');
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se ha podido cambiar');
    } finally {
      this.guardandoPass.set(false);
    }
  }

  async guardarCorreo() {
    this.aviso.set(''); this.error.set('');
    this.guardandoMail.set(true);
    try {
      const guardado = await this.falm.guardarEmailContacto(this.email());
      this.equipo.set({ ...this.equipo()!, emailContacto: guardado || null });
      this.email.set(guardado);
      this.aviso.set(guardado ? 'Correo guardado.' : 'Correo quitado.');
    } catch (e: any) {
      this.error.set(e?.message ?? 'No se ha podido guardar');
    } finally {
      this.guardandoMail.set(false);
    }
  }
}
