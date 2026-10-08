import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AdminNotification, NotificationService } from '../notifications/notification.service';
import { AdminBookingService } from '../bookings/admin-booking.service';
import { AdminSettingsService } from '../settings/admin-settings.service';
import { BrandingMediaService } from '../settings/branding-media.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss'
})
export class AdminShellComponent implements OnInit {
  @Input() eyebrow = 'ADMIN CENTER';
  @Input() title = 'Admin';

  sidebarOpen = false;
  profileMenuOpen = false;
  notificationMenuOpen = false;

  get currentUser(): { name: string; role: string; initials: string } {
    const user = this.authService.currentUser;
    const role = user?.role?.trim() || 'Administrator';
    const savedName = user?.fullName?.trim() || '';

    const isLegacyOwnerName = /^royal\s+barbers\s+owner$/i.test(savedName)
      || /^salon\s+owner$/i.test(savedName);

    const name = isLegacyOwnerName
      ? `${this.businessName} Owner`
      : (savedName || (role.toLowerCase() === 'owner'
          ? `${this.businessName} Owner`
          : 'Administrator'));

    return {
      name,
      role,
      initials: this.initials(name)
    };
  }

  constructor(
    public readonly router: Router,
    public readonly notificationService: NotificationService,
    public readonly bookingService: AdminBookingService,
    public readonly settingsService: AdminSettingsService,
    public readonly brandingMedia: BrandingMediaService,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    // Refresh the profile from SQL so the owner name is not stuck on an older
    // browser session value such as "Royal Barbers Owner".
    this.authService.me().subscribe({
      error: () => {
        // Keep the valid cached login profile if the refresh is temporarily unavailable.
      }
    });
  }

  get businessName(): string {
    return this.settingsService.current.businessName || 'Salon';
  }

  get businessCity(): string {
    return this.settingsService.current.city || 'Salon';
  }

  get businessInitials(): string {
    const words = this.businessName
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) return 'S';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  private initials(name: string): string {
    const words = name.split(/\s+/).filter(Boolean);
    if (!words.length) return 'A';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  get currentPath(): string {
    return this.router.url.split('?')[0];
  }

  isActive(path: string): boolean {
    return path === '/admin'
      ? this.currentPath === '/admin'
      : this.currentPath.startsWith(path);
  }

  navigate(path: string): void {
    this.sidebarOpen = false;
    this.notificationMenuOpen = false;
    this.profileMenuOpen = false;
    void this.router.navigateByUrl(path);
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.notificationMenuOpen = false;
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  toggleNotificationMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen = false;
    this.notificationMenuOpen = !this.notificationMenuOpen;
  }

  openNotification(notification: AdminNotification): void {
    this.notificationService.markAsRead(notification.id);
    this.notificationMenuOpen = false;

    if (notification.url) {
      void this.router.navigateByUrl(notification.url);
    }
  }

  markAllNotificationsAsRead(event: MouseEvent): void {
    event.stopPropagation();
    this.notificationService.markAllAsRead();
  }

  viewAllNotifications(): void {
    this.navigate('/admin/notifications');
  }

  logout(): void {
    this.profileMenuOpen = false;
    this.authService.logout();
    void this.router.navigateByUrl('/admin/login');
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.profileMenuOpen = false;
    this.notificationMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.profileMenuOpen = false;
    this.notificationMenuOpen = false;
    this.sidebarOpen = false;
  }
}
