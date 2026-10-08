import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token?: string;
  expiresAt?: string;
  user?: AuthUser;
}

export interface AuthMutationResponse {
  success: boolean;
  message: string;
  user?: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseUrl = '/api/auth';
  private readonly tokenKey = 'adminToken';
  private readonly userKey = 'adminUser';
  private readonly expiresKey = 'adminTokenExpiresAt';

  private readonly userSubject = new BehaviorSubject<AuthUser | null>(this.readUser());
  readonly currentUser$ = this.userSubject.asObservable();

  constructor(private readonly http: HttpClient) {
    if (!this.isAuthenticated()) {
      this.clearSession();
    }
  }

  get currentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  get token(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(this.tokenKey)
      || window.sessionStorage.getItem(this.tokenKey);
  }


  changePassword(currentPassword: string, newPassword: string): Observable<AuthMutationResponse> {
    return this.http.patch<AuthMutationResponse>(this.baseUrl + '/password', {
      currentPassword,
      newPassword
    });
  }

  requestEmailChange(currentPassword: string, newEmail: string): Observable<AuthMutationResponse> {
    return this.http.post<AuthMutationResponse>(this.baseUrl + '/email-change/request', {
      currentPassword,
      newEmail: newEmail.trim()
    });
  }

  confirmEmailChange(newEmail: string, code: string): Observable<AuthMutationResponse> {
    return this.http.post<AuthMutationResponse>(this.baseUrl + '/email-change/confirm', {
      newEmail: newEmail.trim(),
      code
    }).pipe(
      tap(response => {
        if (response.success && response.user) {
          this.updateStoredUser(response.user);
        }
      })
    );
  }

  requestPasswordReset(email: string): Observable<AuthMutationResponse> {
    return this.http.post<AuthMutationResponse>(this.baseUrl + '/password-reset/request', {
      email: email.trim()
    });
  }

  confirmPasswordReset(email: string, code: string, newPassword: string): Observable<AuthMutationResponse> {
    return this.http.post<AuthMutationResponse>(this.baseUrl + '/password-reset/confirm', {
      email: email.trim(),
      code,
      newPassword
    });
  }

  login(email: string, password: string, rememberMe: boolean): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(this.baseUrl + '/login', {
      email: email.trim(),
      password,
      rememberMe
    }).pipe(
      tap(response => {
        if (response.success && response.token && response.expiresAt && response.user) {
          this.storeSession(response.token, response.expiresAt, response.user, rememberMe);
        }
      })
    );
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(this.baseUrl + '/me')
      .pipe(tap(user => this.userSubject.next(user)));
  }

  isAuthenticated(): boolean {
    const token = this.token;
    const expiresAt = this.readValue(this.expiresKey);
    if (!token || !expiresAt) return false;

    const expires = Date.parse(expiresAt);
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      this.clearSession();
      return false;
    }

    return true;
  }

  logout(): void {
    this.clearSession();
  }

  private storeSession(token: string, expiresAt: string, user: AuthUser, rememberMe: boolean): void {
    if (typeof window === 'undefined') return;

    this.clearSession();
    const storage = rememberMe ? window.localStorage : window.sessionStorage;
    storage.setItem(this.tokenKey, token);
    storage.setItem(this.expiresKey, expiresAt);
    storage.setItem(this.userKey, JSON.stringify(user));
    this.userSubject.next(user);
  }

  private clearSession(): void {
    if (typeof window === 'undefined') return;

    for (const storage of [window.localStorage, window.sessionStorage]) {
      storage.removeItem(this.tokenKey);
      storage.removeItem(this.expiresKey);
      storage.removeItem(this.userKey);
    }

    this.userSubject.next(null);
  }

  private updateStoredUser(user: AuthUser): void {
    if (typeof window === 'undefined') {
      this.userSubject.next(user);
      return;
    }

    for (const storage of [window.localStorage, window.sessionStorage]) {
      if (storage.getItem(this.userKey)) {
        storage.setItem(this.userKey, JSON.stringify(user));
      }
    }

    this.userSubject.next(user);
  }

  private readUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;

    for (const storage of [window.localStorage, window.sessionStorage]) {
      const raw = storage.getItem(this.userKey);
      if (!raw) continue;

      try {
        const user = JSON.parse(raw) as AuthUser;
        if (user?.fullName && user?.email) return user;
      } catch {
        // Ignore malformed legacy session data.
      }
    }

    return null;
  }

  private readValue(key: string): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  }
}
