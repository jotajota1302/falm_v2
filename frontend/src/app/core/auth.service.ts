import { Injectable, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';

/** Autenticación contra Supabase Auth. Expone la sesión como signal. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);

  constructor(private sb: SupabaseService) {
    this.sb.client.auth.onAuthStateChange((_event, session) => this.apply(session));
  }

  /**
   * Garantiza una sesión antes de arrancar la app. En modo dev, si no hay sesión,
   * inicia una sesión ANÓNIMA (rol authenticated -> RLS permite leer). Llamado por APP_INITIALIZER.
   */
  async ensureSession(): Promise<void> {
    const { data } = await this.sb.client.auth.getSession();
    if (data.session) {
      this.apply(data.session);
      return;
    }
    if (environment.devAnonLogin) {
      const { data: anon, error } = await this.sb.client.auth.signInAnonymously();
      if (!error) this.apply(anon.session);
    }
  }

  private apply(session: Session | null) {
    this.session.set(session);
    this.user.set(session?.user ?? null);
  }

  async signIn(email: string, password: string) {
    const { error } = await this.sb.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /** Login por NOMBRE DE EQUIPO: resuelve el email del usuario y entra con la contraseña. */
  async loginEquipo(nombre: string, password: string) {
    const { data, error } = await this.sb.client.rpc('email_de_equipo', { p_nombre: nombre.trim() });
    if (error) throw error;
    if (!data) throw new Error('No existe ningún equipo con ese nombre.');
    await this.signIn(data as string, password);
  }

  /**
   * Login SOLO por nombre de equipo (sin contraseña, provisional): sesión anónima
   * por debajo (rol authenticated → RLS lee; escrituras propias vía RPC SECURITY DEFINER)
   * + el equipo elegido se guarda para resolver "mi equipo".
   */
  async loginNombre(nombre: string) {
    const eq = nombre.trim();
    const { error } = await this.sb.client.auth.signInAnonymously();
    if (error) throw error;
    const { data } = await this.sb.client.from('equipo_falm').select('id').eq('nombre', eq).limit(1);
    if (!data || !data.length) { await this.signOut(); throw new Error('No existe ningún equipo con ese nombre.'); }
    localStorage.setItem('falm_equipo', eq);
  }

  async signUp(email: string, password: string) {
    const { error } = await this.sb.client.auth.signUp({ email, password });
    if (error) throw error;
  }

  async signOut() {
    localStorage.removeItem('falm_equipo');
    await this.sb.client.auth.signOut();
  }

  isLoggedIn() {
    return this.session() !== null;
  }
}
