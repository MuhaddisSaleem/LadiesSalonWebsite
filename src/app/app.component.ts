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
    let lastScrollY = window.scrollY;
    const updateHomeScroll = (): void => {
      if (!homepage) return;
      const currentY = window.scrollY;
      const movingDown = currentY > lastScrollY;
      const movingUp = currentY < lastScrollY;
      lastScrollY = currentY;
      const elements = root.querySelectorAll<HTMLElement>(selectors);
      if (movingUp && currentY <= 16) {
        // Re-arm below-the-fold sections only after returning to the top.
        // Never make anything on screen disappear during an upward scroll.
        elements.forEach(element => {
          if (element.getBoundingClientRect().top >= window.innerHeight) {
            element.classList.remove('bloom-visible');
          }
        });
        return;
      }
      if (!movingDown) return;
      elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        if (rect.top <= window.innerHeight * .76 && rect.bottom > 0) {
          element.classList.add('bloom-visible');
        }
      });
    };
    if (homepage) {
      window.addEventListener('scroll', updateHomeScroll, { passive: true });
      this.removeHomeScroll = () => window.removeEventListener('scroll', updateHomeScroll);
    }
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (!homepage) {
          entry.target.classList.add('bloom-visible');
          this.observer?.unobserve(entry.target);
        } else if (window.scrollY <= 16 && entry.boundingClientRect.top < window.innerHeight * .65) {
          // Only the initial above-the-fold hero is revealed on load.
          entry.target.classList.add('bloom-visible');
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px 0px 0px' });

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
    this.removeHomeScroll?.();
    if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.setupFrame);
  }
}
