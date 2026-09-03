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

  /**
   * Login por NOMBRE DE EQUIPO. El nombre se busca sin distinguir mayúsculas ni
   * espacios, pero lo que se guarda es el nombre canónico: "mi equipo" se
   * resuelve comparando ese texto con la base, así que guardar lo que tecleó el
   * usuario dejaba la sesión sin equipo.
   */
  async loginEquipo(nombre: string, password: string) {
    const eq = nombre.trim();
    const { data, error } = await this.sb.client.rpc('email_de_equipo', { p_nombre: eq });
    if (error) throw error;
    if (!data) throw new Error('No hay ningún equipo con ese nombre.');

    const { data: canonico } = await this.sb.client.rpc('nombre_de_equipo', { p_nombre: eq });
    const nombreReal = (canonico as string) ?? eq;

    try {
      await this.signIn(data as string, password);
    } catch (e: any) {
      // La contraseña es el nombre del equipo, y Supabase distingue mayúsculas.
      // Si escribió el nombre pero con otra caja, se reintenta con el canónico.
      const quisoElNombre = password.trim().toLowerCase() === nombreReal.toLowerCase();
      if (!quisoElNombre) throw new Error('Contraseña incorrecta.');
      await this.signIn(data as string, nombreReal);
    }

    localStorage.setItem('falm_equipo', nombreReal);
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
