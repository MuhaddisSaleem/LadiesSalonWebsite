import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { LegacyCatalogMigrationService } from '../core/legacy-catalog-migration.service';
import { BrandingMediaService } from '../admin/settings/branding-media.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.scss'
})
export class AdminLoginComponent {
  email = '';
  password = '';
  rememberMe = true;
  showPassword = false;
  loading = false;
  errorMessage = '';
  loginNotice = '';

  recoveryStep: 'login' | 'request' | 'reset' = 'login';
  recoveryEmail = '';
  recoveryCode = '';
  recoveryPassword = '';
  recoveryPasswordConfirm = '';
  recoveryLoading = false;
  recoveryMessage = '';
  recoveryError = '';
  resendSeconds = 0;
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly migration: LegacyCatalogMigrationService,
    public readonly brandingMedia: BrandingMediaService
  ) {
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl('/admin');
    }
  }

  openPasswordRecovery(): void {
    if (this.loading || this.recoveryLoading) return;

    this.recoveryStep = 'request';
    this.recoveryEmail = this.email.trim();
    this.recoveryCode = '';
    this.recoveryPassword = '';
    this.recoveryPasswordConfirm = '';
    this.recoveryMessage = '';
    this.recoveryError = '';
    this.errorMessage = '';
    this.loginNotice = '';
  }

  backToLogin(): void {
    if (this.recoveryLoading) return;

    this.recoveryStep = 'login';
    this.recoveryError = '';
    this.recoveryMessage = '';
    this.stopResendTimer();
  }

  requestPasswordReset(): void {
    if (this.recoveryLoading) return;

    const email = this.recoveryEmail.trim();
    if (!email) {
      this.recoveryError = 'Enter your admin login email address.';
      return;
    }

    this.recoveryLoading = true;
    this.recoveryError = '';
    this.recoveryMessage = '';

    this.auth.requestPasswordReset(email).subscribe({
      next: response => {
        this.recoveryLoading = false;

        if (!response.success) {
          this.recoveryError = response.message;
          return;
        }

        this.recoveryStep = 'reset';
        this.recoveryMessage = response.message;
        this.startResendTimer();
      },
      error: error => {
        this.recoveryLoading = false;
        this.recoveryError =
          error?.error?.message
          || (error?.status === 0
            ? 'The admin API is unavailable. Make sure the backend is running.'
            : 'Could not start password recovery.');
      }
    });
  }

  resendPasswordReset(): void {
    if (this.recoveryLoading || this.resendSeconds > 0) return;
    this.requestPasswordReset();
  }

  onRecoveryCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const code = input.value.replace(/\D/g, '').slice(0, 6);
    this.recoveryCode = code;
    input.value = code;
  }

  confirmPasswordReset(): void {
    if (this.recoveryLoading) return;

    const code = this.recoveryCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      this.recoveryError = 'Enter the 6-digit verification code.';
      return;
    }

    if (this.recoveryPassword.length < 8) {
      this.recoveryError = 'New password must contain at least 8 characters.';
      return;
    }

    if (!/[A-Za-z]/.test(this.recoveryPassword) || !/\d/.test(this.recoveryPassword)) {
      this.recoveryError = 'New password must include at least one letter and one number.';
      return;
    }

    if (this.recoveryPassword !== this.recoveryPasswordConfirm) {
      this.recoveryError = 'New password and confirmation do not match.';
      return;
    }

    this.recoveryLoading = true;
    this.recoveryError = '';

    this.auth.confirmPasswordReset(
      this.recoveryEmail,
      code,
      this.recoveryPassword
    ).subscribe({
      next: response => {
        this.recoveryLoading = false;

        if (!response.success) {
          this.recoveryError = response.message;
          return;
        }

        this.email = this.recoveryEmail.trim();
        this.password = '';
        this.recoveryStep = 'login';
        this.loginNotice = response.message;
        this.recoveryMessage = '';
        this.recoveryError = '';
        this.recoveryCode = '';
        this.recoveryPassword = '';
        this.recoveryPasswordConfirm = '';
        this.stopResendTimer();
      },
      error: error => {
        this.recoveryLoading = false;
        this.recoveryError =
          error?.error?.message
          || (error?.status === 0
            ? 'The admin API is unavailable. Make sure the backend is running.'
            : 'Could not reset the password.');
      }
    });
  }

  private startResendTimer(): void {
    this.stopResendTimer();
    this.resendSeconds = 60;

    this.resendTimer = setInterval(() => {
      this.resendSeconds = Math.max(0, this.resendSeconds - 1);
      if (this.resendSeconds === 0) this.stopResendTimer();
    }, 1000);
  }

  private stopResendTimer(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }

    this.resendSeconds = 0;
  }

  login(): void {
    if (this.loading) return;

    if (!this.email.trim() || !this.password) {
      this.errorMessage = 'Enter your email and password.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.auth.login(this.email, this.password, this.rememberMe).subscribe({
      next: async response => {
        if (!response.success) {
          this.loading = false;
          this.errorMessage = response.message || 'Unable to sign in.';
          return;
        }

        // A legacy browser migration may have been deferred until authentication existed.
        await this.migration.initialize();

        const requested = this.route.snapshot.queryParamMap.get('returnUrl') || '/admin';
        const destination =
          requested.startsWith('/admin') && requested !== '/admin/login'
            ? requested
            : '/admin';

        this.loading = false;
        await this.router.navigateByUrl(destination);
      },
      error: error => {
        this.loading = false;
        this.errorMessage =
          error?.error?.message
          || (error?.status === 0
            ? 'The admin API is unavailable. Make sure the backend is running.'
            : 'Invalid email or password.');
      }
    });
  }

  openBookingSite(): void {
    void this.router.navigateByUrl('/');
  }
}
