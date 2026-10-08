import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminSettingsService } from '../admin/settings/admin-settings.service';
import { BrandingMediaService } from '../admin/settings/branding-media.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent implements AfterViewInit, OnDestroy {
  readonly instagramUrl = 'https://www.instagram.com/thetrimtownstudio/';
  readonly facebookUrl = 'https://www.facebook.com/trimtownstudio';
  readonly locationUrl = 'https://maps.app.goo.gl/qXg3irTRuPDktw9h7';
  readonly contactEmail = 'thetrimtown@gmail.com';

  private revealObserver?: IntersectionObserver;

  constructor(
    private readonly settingsService: AdminSettingsService,
    public readonly brandingMedia: BrandingMediaService,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  ngAfterViewInit(): void {
    const footer = this.host.nativeElement.querySelector<HTMLElement>('.site-footer');
    if (!footer) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      footer.classList.add('is-visible');
      return;
    }

    footer.classList.add('motion-ready');

    this.revealObserver = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;

        footer.classList.add('is-visible');
        this.revealObserver?.disconnect();
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -5% 0px'
      }
    );

    this.revealObserver.observe(footer);
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
  }

  scrollToTop(): void {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  get businessName(): string {
    return this.settingsService.current.businessName || 'The Trim Town';
  }

  get businessNameUpper(): string {
    return this.businessName.toUpperCase();
  }

  get brandSubtitle(): string {
    return this.settingsService.current.brandSubtitle || 'Premium Grooming Studio';
  }

  get locationLabel(): string {
    const settings = this.settingsService.current;
    const location = [settings.address, settings.city].filter(Boolean).join(', ');
    return location || 'The Trim Town Studio, Bahawalpur';
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }
}
