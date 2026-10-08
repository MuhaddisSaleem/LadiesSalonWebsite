import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminSettingsService } from '../admin/settings/admin-settings.service';
import { BrandingMediaService } from '../admin/settings/branding-media.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../admin/notifications/notification.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss', '../customer-booking/customer-booking.component.scss']
})
export class HeaderComponent {
  @Input() bloomMode = false;
  menuOpen = false;
  openBloomBooking(): void {
    this.menuOpen = false;
    const section = document.getElementById('appointment');
    section?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
    section?.focus({preventScroll: true});
  }

  constructor(
    private readonly settingsService: AdminSettingsService,
    public readonly brandingMedia: BrandingMediaService,
    public readonly notificationService: NotificationService,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  get businessName(): string {
    return this.settingsService.current.businessName || 'Salon';
  }

  get businessNameUpper(): string {
    return this.businessName.toUpperCase();
  }

  get brandSubtitle(): string {
    return this.settingsService.current.brandSubtitle || '';
  }

  get isAdminLoggedIn(): boolean {
    return this.authService.isAuthenticated();
  }

  openLiveBookingAlert(): void {
    const notification = this.notificationService.liveBookingAlert;
    if (!notification) return;

    this.notificationService.markAsRead(notification.id);
    this.notificationService.dismissLiveBookingAlert();
    void this.router.navigateByUrl(notification.url || '/admin/bookings');
  }


  goToContact(event: Event): void {
    event.preventDefault();

    if (typeof document === 'undefined') return;

    this.pauseCatalogAutoLoad();

    const scrollToContact = (attempt = 0): void => {
      const contact = document.getElementById('contact');

      if (!contact) {
        if (attempt < 20) {
          window.setTimeout(() => scrollToContact(attempt + 1), 50);
          return;
        }

        this.resumeCatalogAutoLoad();
        return;
      }

      contact.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });

      // Keep automatic catalog expansion paused for the whole programmatic
      // journey to the footer. Normal manual scrolling is unaffected.
      window.setTimeout(() => this.resumeCatalogAutoLoad(), 1800);
    };

    const currentPath = this.router.url.split(/[?#]/)[0];

    if (currentPath === '/') {
      scrollToContact();
      return;
    }

    this.router.navigate(['/']).then(navigated => {
      if (!navigated) {
        this.resumeCatalogAutoLoad();
        return;
      }

      requestAnimationFrame(() => scrollToContact());
    });
  }

  private pauseCatalogAutoLoad(): void {
    document.documentElement.setAttribute('data-programmatic-anchor-scroll', 'true');
  }

  private resumeCatalogAutoLoad(): void {
    document.documentElement.removeAttribute('data-programmatic-anchor-scroll');
  }

  get isAboutPage(): boolean {
    return this.router.url.split('?')[0].startsWith('/about');
  }

  get isGalleryPage(): boolean {
    return this.router.url.split('?')[0].startsWith('/gallery');
  }
}
