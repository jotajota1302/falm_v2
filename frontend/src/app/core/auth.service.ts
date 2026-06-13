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

  async signUp(email: string, password: string) {
    const { error } = await this.sb.client.auth.signUp({ email, password });
    if (error) throw error;
  }

  async signOut() {
    await this.sb.client.auth.signOut();
  }

  isLoggedIn() {
    return this.session() !== null;
  }
}
