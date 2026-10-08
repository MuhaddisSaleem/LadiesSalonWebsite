import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminSettingsService } from '../admin/settings/admin-settings.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss'
})
export class AboutComponent implements AfterViewInit, OnDestroy {
  private revealObserver?: IntersectionObserver;

  constructor(
    private readonly settingsService: AdminSettingsService,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  get businessName(): string {
    return this.settingsService.current.businessName || 'The Trim Town';
  }

  get city(): string {
    return this.settingsService.current.city || 'Bahawalpur';
  }

  ngAfterViewInit(): void {
    const root = this.host.nativeElement;
    const section = root.querySelector<HTMLElement>('.about-section');
    const revealElements = Array.from(root.querySelectorAll<HTMLElement>('.scroll-reveal'));

    section?.classList.add('motion-ready');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      revealElements.forEach(element => element.classList.add('is-visible'));
      return;
    }

    this.revealObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;

          const element = entry.target as HTMLElement;
          element.classList.add('is-visible');
          this.revealObserver?.unobserve(element);
        });
      },
      {
        root: null,
        threshold: 0.14,
        rootMargin: '0px 0px -8% 0px'
      }
    );

    revealElements.forEach(element => this.revealObserver?.observe(element));
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
  }
}
