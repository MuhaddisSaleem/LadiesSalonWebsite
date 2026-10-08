import { AfterViewInit, Directive, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output } from '@angular/core';

/** Load near the active catalog's end; keep the button as an accessible fallback. */
@Directive({ selector: '[appLoadMore]', standalone: true })
export class LoadMoreDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input() loadMoreBusy = false;
  @Output() reached = new EventEmitter<void>();
  private observer?: IntersectionObserver;
  private frame?: number;
  private ready = false;
  private pending = false;

  constructor(private element: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.ready = true;
    this.zone.runOutsideAngular(() => {
      if (typeof IntersectionObserver !== 'undefined') {
        this.observer = new IntersectionObserver(() => this.scheduleCheck(), {
          threshold: 0.01,
          rootMargin: '0px 0px 90px 0px'
        });
        this.observer.observe(this.element.nativeElement);
      }
      // IntersectionObserver does not fire again when the sentinel stays visible,
      // including after an entry suppressed during Contact Us navigation.
      window.addEventListener('scroll', this.scheduleCheck, { passive: true, capture: true });
      window.addEventListener('resize', this.scheduleCheck, { passive: true });
      this.scheduleCheck();
    });
  }

  ngOnChanges(): void {
    if (!this.loadMoreBusy) {
      this.pending = false;
      // Measure after Angular has rendered the newly added service cards.
      this.zone.runOutsideAngular(() => this.scheduleCheck());
    }
  }

  private scheduleCheck = (): void => {
    if (!this.ready || this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      if (this.loadMoreBusy || this.pending) return;
      if (document.documentElement.hasAttribute('data-programmatic-anchor-scroll')) return;

      const rect = this.element.nativeElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0
        || rect.top > window.innerHeight + 90) return;

      this.pending = true;
      this.zone.run(() => this.reached.emit());
    });
  };

  ngOnDestroy(): void {
    this.ready = false;
    this.observer?.disconnect();
    window.removeEventListener('scroll', this.scheduleCheck, true);
    window.removeEventListener('resize', this.scheduleCheck);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
  }
}
