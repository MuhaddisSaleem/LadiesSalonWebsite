import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { BloomHeaderComponent } from './bloom-header.component';
import { BloomFooterComponent } from './bloom-footer.component';
import { forkJoin, Subscription } from 'rxjs';
import { CatalogApiService } from '../core/catalog-api.service';
import type { AdminService, AdminServiceCategory } from '../admin/services/admin-service.service';

@Component({
  selector: 'app-customer-booking',
  standalone: true,
  imports: [CommonModule, BloomHeaderComponent, BloomFooterComponent],
  templateUrl: './customer-booking.component.html',
  styleUrls: ['./customer-booking.component.scss']
})
export class CustomerBookingComponent implements OnInit, OnDestroy {
  readonly fallbackImage = 'assets/images/bloom/service-placeholder.svg';
  services: AdminService[] = [];
  categories: AdminServiceCategory[] = [];
  activeFilter: number | 'all' = 'all';
  visibleCount = 12;
  loading = true;
  loadError = '';
  showBridal = false;
  private request?: Subscription;
  private changes?: Subscription;

  constructor(private readonly catalog: CatalogApiService) {}

  ngOnInit(): void {
    this.loadServices();
    this.changes = this.catalog.changes$.subscribe(scope => {
      if (scope === 'services' || scope === 'categories') this.loadServices();
    });
  }

  loadServices(): void {
    this.request?.unsubscribe();
    this.loading = true;
    this.loadError = '';
    this.request = forkJoin({ services: this.catalog.getServices(), categories: this.catalog.getServiceCategories() }).subscribe({
      next: ({ services, categories }) => {
        const inactiveIds = new Set(categories.filter(item => item.status !== 'Active').map(item => item.id));
        this.services = services.filter(item => item.status === 'Active' && !inactiveIds.has(item.categoryId));
        this.categories = categories.filter(item => item.status === 'Active')
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
        if (this.activeFilter !== 'all' && !this.categories.some(item => item.id === this.activeFilter)) this.selectCategory('all');
        this.loading = false;
      },
      error: () => {
        this.services = [];
        this.categories = [];
        this.loading = false;
        this.loadError = 'We could not load the service menu. Please try again.';
      }
    });
  }

  get filteredServices(): AdminService[] {
    return this.services.filter(item => this.activeFilter === 'all' || item.categoryId === this.activeFilter);
  }
  get visibleServices(): AdminService[] { return this.filteredServices.slice(0, this.visibleCount); }
  selectCategory(category: number | 'all'): void { this.activeFilter = category; this.visibleCount = 12; }
  showMore(): void { this.visibleCount += 12; }
  hasDiscount(service: AdminService): boolean {
    return service.discountPrice !== null && service.discountPrice >= 0 && service.discountPrice < service.originalPrice;
  }
  price(service: AdminService): number { return this.hasDiscount(service) ? service.discountPrice! : service.originalPrice; }
  categoryName(service: AdminService): string {
    return this.categories.find(item => item.id === service.categoryId)?.name || service.categoryName || 'Beauty service';
  }
  trackId(_index: number, item: { id: number }): number { return item.id; }
  imageFailed(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!image.src.endsWith(this.fallbackImage)) image.src = this.fallbackImage;
  }
  ngOnDestroy(): void { this.request?.unsubscribe(); this.changes?.unsubscribe(); }
  openBooking(): void {
    const section = document.getElementById('appointment');
    section?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
  }
}
