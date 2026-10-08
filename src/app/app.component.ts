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
  private removeHomeScroll?: () => void;

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
    this.removeHomeScroll?.();
    this.removeHomeScroll = undefined;
    this.setupFrame = requestAnimationFrame(() => this.initReveals());
  }

  private initReveals(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Do not touch authenticated admin routes or legacy booking animations.
    if (this.router.url.split(/[?#]/)[0].startsWith('/admin')) return;
    const root = document.querySelector<HTMLElement>('.bloom-page, .appointment-page');
    if (!root) return;
    const homepage = this.router.url.split(/[?#]/)[0] === '/';
    const selector = [
      '.hero-copy', '.hero-photo', '.services-page-intro',
      '.services-section .service-grid .service-card',
      '.bridal-copy', '.bride-photo', '.home-booking-cta-copy',
      '.home-booking-button', '.multi-booking-cta-copy', '.multi-booking-cta-button',
      '.gallery-section > h2', '.gallery-grid > *', '.story-section > *',
      '.appointment-main .intro', '.booking-panel', '.summary-panel',
      '.bloom-footer .footer-top'
    ].join(', ');
    const selectors = homepage ? selector + ', .services-section' : selector;
    const homeServices = homepage ? root.querySelector<HTMLElement>('.services-section') : null;
    const revealHomeServices = (): void => {
      if (!homeServices) return;
      const rect = homeServices.getBoundingClientRect();
      // Reset only once the entire section leaves the viewport; never hide it mid-scroll.
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
        homeServices.classList.remove('bloom-visible');
      } else if (window.scrollY >= 24 && rect.top <= window.innerHeight * .72) {
        homeServices.classList.add('bloom-visible');
      }
    };
    if (homeServices) {
      window.addEventListener('scroll', revealHomeServices, { passive: true });
      this.removeHomeScroll = () => window.removeEventListener('scroll', revealHomeServices);
    }
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === homeServices) continue;
        if (entry.isIntersecting) {
          entry.target.classList.add('bloom-visible');
          if (!homepage) this.observer?.unobserve(entry.target);
        } else if (homepage) {
          const bounds = entry.boundingClientRect;
          if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) {
            entry.target.classList.remove('bloom-visible');
          }
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px 30px 0px' });

    const observe = (): void => {
      root.querySelectorAll<HTMLElement>(selectors).forEach((element, index) => {
        if (element.classList.contains('bloom-reveal')) return;
        element.classList.add('bloom-reveal');
        const serviceCard = element.matches('.service-grid .service-card');
        if (serviceCard) {
          const cardIndex = Array.from(element.parentElement?.children || []).indexOf(element);
          element.style.setProperty('--bloom-stagger', `${Math.max(0, cardIndex % 4) * 110}ms`);
        } else {
          element.style.setProperty('--bloom-stagger', `${index % 4 * 65}ms`);
        }
        // Content already in view should never be hidden waiting for a scroll.
        if (element !== homeServices) this.observer?.observe(element);
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
    this.removeHomeScroll?.();
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.setupFrame);
  }
}
