import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { AdminShellComponent } from '../shared/admin-shell.component';

@Component({
  selector: 'app-account-security',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  templateUrl: './account-security.component.html',
  styleUrl: './account-security.component.scss'
})
export class AccountSecurityComponent implements OnInit {
  feedbackMessage = '';
  feedbackType: 'success' | 'error' = 'success';

  newLoginEmail = '';
  emailCurrentPassword = '';
  emailVerificationCode = '';
  emailVerificationSent = false;
  emailSecurityBusy = false;

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  passwordSecurityBusy = false;

  constructor(public readonly authService: AuthService, private readonly router: Router) {}

  ngOnInit(): void {
    this.authService.me().subscribe({
      error: () => {
        // Keep the authenticated cached profile if the refresh is temporarily unavailable.
      }
    });
  }

  get currentLoginEmail(): string {
    return this.authService.currentUser?.email || 'Loading...';
  }

  get currentOwnerName(): string {
    return this.authService.currentUser?.fullName || 'HairSense Owner';
  }

  requestLoginEmailChange(): void {
    if (this.emailSecurityBusy) return;

    const email = this.newLoginEmail.trim();
    if (!email) {
      this.showFeedback(false, 'Enter the new login email address.');
      return;
    }

    if (!this.emailCurrentPassword) {
      this.showFeedback(false, 'Enter your current password to change the login email.');
      return;
    }

    this.emailSecurityBusy = true;
    this.authService.requestEmailChange(this.emailCurrentPassword, email).subscribe({
      next: response => {
        this.emailSecurityBusy = false;
        this.emailVerificationSent = response.success;

        if (response.success) {
          this.emailVerificationCode = '';
          this.showFeedback(true, response.message);
          return;
        }

        this.showFeedback(false, response.message);
      },
      error: error => {
        this.emailSecurityBusy = false;
        this.showFeedback(false, this.apiError(error, 'Could not send the verification code.'));
      }
    });
  }

  confirmLoginEmailChange(): void {
    if (this.emailSecurityBusy) return;

    const code = this.emailVerificationCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      this.showFeedback(false, 'Enter the 6-digit verification code.');
      return;
    }

    this.emailSecurityBusy = true;
    this.authService.confirmEmailChange(this.newLoginEmail, code).subscribe({
      next: response => {
        this.emailSecurityBusy = false;

        if (!response.success) {
          this.showFeedback(false, response.message);
          return;
        }

        this.newLoginEmail = '';
        this.emailCurrentPassword = '';
        this.emailVerificationCode = '';
        this.emailVerificationSent = false;
        this.showFeedback(true, response.message);
      },
      error: error => {
        this.emailSecurityBusy = false;
        this.showFeedback(false, this.apiError(error, 'Could not verify the new login email.'));
      }
    });
  }

  cancelLoginEmailChange(): void {
    if (this.emailSecurityBusy) return;
    this.newLoginEmail = '';
    this.emailCurrentPassword = '';
    this.emailVerificationCode = '';
    this.emailVerificationSent = false;
  }

  onEmailVerificationInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 6);
    this.emailVerificationCode = value;
    input.value = value;
  }

  changeAdminPassword(): void {
    if (this.passwordSecurityBusy) return;

    if (!this.currentPassword) {
      this.showFeedback(false, 'Enter your current password.');
      return;
    }

    if (this.newPassword.length < 8) {
      this.showFeedback(false, 'New password must contain at least 8 characters.');
      return;
    }

    if (!/[A-Za-z]/.test(this.newPassword) || !/\d/.test(this.newPassword)) {
      this.showFeedback(false, 'New password must include at least one letter and one number.');
      return;
    }

    if (this.newPassword !== this.confirmNewPassword) {
      this.showFeedback(false, 'New password and confirmation do not match.');
      return;
    }

    this.passwordSecurityBusy = true;
    this.authService.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: response => {
        this.passwordSecurityBusy = false;

        if (!response.success) {
          this.showFeedback(false, response.message);
          return;
        }

        this.currentPassword = '';
        this.newPassword = '';
        this.confirmNewPassword = '';
        this.showFeedback(true, response.message);
        this.authService.logout();
        void this.router.navigateByUrl('/admin/login');
      },
      error: error => {
        this.passwordSecurityBusy = false;
        this.showFeedback(false, this.apiError(error, 'Could not change the password.'));
      }
    });
  }

  private showFeedback(success: boolean, message: string): void {
    this.feedbackType = success ? 'success' : 'error';
    this.feedbackMessage = message;

    window.setTimeout(() => {
      if (this.feedbackMessage === message) this.feedbackMessage = '';
    }, 5000);
  }

  private apiError(error: unknown, fallback: string): string {
    return (error as any)?.error?.message || fallback;
  }
}
