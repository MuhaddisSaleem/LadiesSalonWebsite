import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>'
})
export class AppComponent implements AfterViewInit, OnDestroy {
  private navigation?: Subscription;
  private observer?: IntersectionObserver;
  private mutations?: MutationObserver;
  private setupFrame = 0;

  constructor(private readonly router: Router) {}

  ngAfterViewInit(): void {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    this.navigation = this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.scheduleReveals());
    this.scheduleReveals();
  }

  private scheduleReveals(): void {
    cancelAnimationFrame(this.setupFrame);
    this.observer?.disconnect();
    this.mutations?.disconnect();
    this.setupFrame = requestAnimationFrame(() => this.initReveals());
  }

  private initReveals(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Do not touch authenticated admin routes or legacy booking animations.
    if (this.router.url.split(/[?#]/)[0].startsWith('/admin')) return;
    const root = document.querySelector<HTMLElement>('.bloom-page, .appointment-page');
    if (!root) return;
    const selector = [
      '.hero-copy', '.hero-photo', '.services-section > .eyebrow',
      '.services-section .section-top', '.services-page-intro',
      '.services-section .service-grid .service-card',
      '.services-section .service-grid .service-image-wrap',
      '.bridal-copy', '.bride-photo', '.home-booking-cta-copy',
      '.home-booking-button', '.multi-booking-cta-copy', '.multi-booking-cta-button',
      '.gallery-section > h2', '.gallery-grid > *', '.story-section > *',
      '.appointment-main .intro', '.booking-panel', '.summary-panel',
      '.bloom-footer .footer-top'
    ].join(', ');
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('bloom-visible');
          this.observer?.unobserve(entry.target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px 30px 0px' });

    const observe = (): void => {
      root.querySelectorAll<HTMLElement>(selector).forEach((element, index) => {
        if (element.classList.contains('bloom-reveal')) return;
        element.classList.add('bloom-reveal');
        element.style.setProperty('--bloom-stagger', `${index % 4 * 65}ms`);
        // Content already in view should never be hidden waiting for a scroll.
        this.observer?.observe(element);
      });
    };
    observe();
    this.mutations = new MutationObserver(() => observe());
    this.mutations.observe(root, { childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    this.navigation?.unsubscribe();
    this.observer?.disconnect();
    this.mutations?.disconnect();
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.setupFrame);
  }
}
