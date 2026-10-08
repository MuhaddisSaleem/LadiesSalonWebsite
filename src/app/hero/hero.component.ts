import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy } from '@angular/core';
import { AdminBarberService } from '../admin/barbers/admin-barber.service';
import { AdminSettingsService } from '../admin/settings/admin-settings.service';
import { BrandingMediaService } from '../admin/settings/branding-media.service';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss'
})
export class HeroComponent implements AfterViewInit, OnDestroy {
  private heroSection?: HTMLElement;
  private scrollFrame: number | null = null;
  constructor(
    private readonly settingsService: AdminSettingsService,
    private readonly barberService: AdminBarberService,
    public readonly brandingMedia: BrandingMediaService,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  ngAfterViewInit(): void {
    this.heroSection = this.host.nativeElement.querySelector<HTMLElement>('.royal-hero') ?? undefined;
    this.updateHeroScroll();
  }

  ngOnDestroy(): void {
    if (this.scrollFrame !== null) {
      cancelAnimationFrame(this.scrollFrame);
    }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.scrollFrame !== null) return;

    this.scrollFrame = requestAnimationFrame(() => {
      this.updateHeroScroll();
      this.scrollFrame = null;
    });
  }

  get businessName(): string {
    return this.settingsService.current.businessName || 'Salon';
  }

  get businessNameUpper(): string {
    return this.businessName.toUpperCase();
  }

  get brandSubtitle(): string {
    return this.settingsService.current.brandSubtitle || '';
  }

  get heroEyebrow(): string {
    return this.settingsService.current.heroEyebrow || '';
  }

  get heroHeadline(): string {
    return (this.settingsService.current.heroHeadline || this.businessName).toUpperCase();
  }

  get heroTagline(): string {
    return this.settingsService.current.heroTagline || '';
  }

  get locationLabel(): string {
    const settings = this.settingsService.current;
    return [settings.address, settings.city].filter(Boolean).join(', ') || 'Location not configured';
  }

  get activeBarberCount(): number {
    return this.barberService.active.length;
  }

  get averageRatingLabel(): string {
    const ratings = this.barberService.active
      .map(barber => Number(barber.rating))
      .filter(rating => Number.isFinite(rating) && rating > 0);

    if (!ratings.length) return '—';

    const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    return average.toFixed(1);
  }

  get businessHoursStatus(): { label: string; value: string } {
    const now = this.settingsService.salonNow();
    const hours = this.settingsService.hoursForDate(now);

    if (!hours) {
      return { label: 'Status', value: 'Closed today' };
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    if (nowMinutes < hours.start) {
      return { label: 'Opens at', value: this.minutesToTime(hours.start) };
    }

    if (nowMinutes >= hours.end) {
      return { label: 'Status', value: 'Closed' };
    }

    return { label: 'Open until', value: this.minutesToTime(hours.end) };
  }

  private updateHeroScroll(): void {
    if (!this.heroSection) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.heroSection.style.setProperty('--hero-content-y', '0px');
      this.heroSection.style.setProperty('--hero-content-opacity', '1');
      this.heroSection.style.setProperty('--hero-bg-y', '0px');
      this.heroSection.style.setProperty('--hero-bg-scale', '1.015');
      return;
    }

    const rect = this.heroSection.getBoundingClientRect();
    const height = Math.max(this.heroSection.offsetHeight, 1);
    const progress = Math.min(1, Math.max(0, -rect.top / height));

    this.heroSection.style.setProperty('--hero-content-y', `${(-24 * progress).toFixed(1)}px`);
    this.heroSection.style.setProperty('--hero-content-opacity', (1 - (progress * 0.38)).toFixed(3));
    this.heroSection.style.setProperty('--hero-bg-y', `${(22 * progress).toFixed(1)}px`);
    this.heroSection.style.setProperty('--hero-bg-scale', (1.015 + (progress * 0.03)).toFixed(3));
  }

  private minutesToTime(totalMinutes: number): string {
    let hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ' ' + period;
  }
}
