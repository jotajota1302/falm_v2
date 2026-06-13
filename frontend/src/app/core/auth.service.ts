import { Injectable, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

/** Autenticación por email contra Supabase Auth. Expone la sesión como signal. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);

  constructor(private sb: SupabaseService) {
    // estado inicial + escucha de cambios de sesión
    this.sb.client.auth.getSession().then(({ data }) => this.apply(data.session));
    this.sb.client.auth.onAuthStateChange((_event, session) => this.apply(session));
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
