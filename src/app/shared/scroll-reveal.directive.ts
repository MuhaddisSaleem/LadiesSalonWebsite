import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Directive, ElementRef, Inject, Input, NgZone, OnDestroy, PLATFORM_ID, Renderer2 } from '@angular/core';

/** Reveal each booking section once, without changing its layout or availability. */
@Directive({ selector: '[appScrollReveal]', standalone: true })
export class ScrollRevealDirective implements AfterViewInit, OnDestroy {
  @Input() appScrollReveal = 0;

  private observer?: IntersectionObserver;
  private motion?: MediaQueryList;
  private removeFocusListener?: () => void;
  private readonly onMotionChange = () => {
    if (this.motion?.matches) this.reveal(true);
  };

  constructor(
    private readonly element: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
    private readonly zone: NgZone,
    @Inject(PLATFORM_ID) private readonly platformId: object
  ) {}

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || typeof IntersectionObserver === 'undefined') return;

    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (this.motion.matches) return;

    this.zone.runOutsideAngular(() => {
      const host = this.element.nativeElement;
      this.renderer.setStyle(host, '--reveal-delay', `${this.appScrollReveal}ms`);
      this.renderer.addClass(host, 'booking-reveal');
      this.renderer.addClass(host, 'booking-reveal-pending');
      this.removeFocusListener = this.renderer.listen(host, 'focusin', () => this.reveal(true));
      this.motion?.addEventListener('change', this.onMotionChange);

      try {
        this.observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) this.reveal();
        }, { threshold: 0, rootMargin: '0px 0px -32px 0px' });
        this.observer.observe(host);
      } catch {
        // An unsupported observer must never leave the booking form invisible.
        this.reveal(true);
      }
    });
  }

  private reveal(immediate = false): void {
    if (immediate) this.renderer.removeClass(this.element.nativeElement, 'booking-reveal');
    this.renderer.removeClass(this.element.nativeElement, 'booking-reveal-pending');
    this.observer?.disconnect();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.motion?.removeEventListener('change', this.onMotionChange);
    this.removeFocusListener?.();
  }
}
