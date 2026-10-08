import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { forkJoin, Subscription } from 'rxjs';
import { CatalogApiService } from '../core/catalog-api.service';
import { BookingApiService } from '../core/booking-api.service';
import type { AdminService, AdminServiceCategory } from '../admin/services/admin-service.service';

@Component({
  selector: 'app-customer-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, FooterComponent],
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
  appointment = { serviceIds: [] as number[], date: '', time: '', customerName: '', phone: '' };
  servicePickerOpen = false;
  serviceSearch = '';
  get selectedServices(): AdminService[] { return this.services.filter(item => this.appointment.serviceIds.includes(item.id)); }
  get searchedServices(): AdminService[] { return this.services.filter(item => item.name.toLowerCase().includes(this.serviceSearch.trim().toLowerCase())); }
  toggleAppointmentService(id: number): void {
    if (this.bookingBusy) return;
    const chosen = this.appointment.serviceIds;
    this.appointment.serviceIds = chosen.includes(id) ? chosen.filter(value => value !== id) : [...chosen, id];
  }
  bookingBusy = false;
  bookingFeedback = '';
  bookingSucceeded = false;
  readonly today = this.dateKey(new Date());
  readonly times = Array.from({ length: 27 }, (_, i) => { const minutes = 9 * 60 + i * 30; return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; });
  private request?: Subscription;
  private changes?: Subscription;

  constructor(private readonly catalog: CatalogApiService, private readonly bookingApi: BookingApiService) {}

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

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  submitAppointment(): void {
    if (this.bookingBusy) return;
    const data = this.appointment;
    const selected = this.selectedServices;
    const names = selected.map(item => item.name);
    const duration = selected.reduce((total, item) => total + item.duration, 0);
    const amount = selected.reduce((total, item) => total + this.price(item), 0);
    this.bookingFeedback = '';
    this.bookingSucceeded = false;
    if (!selected.length || !data.date || !data.time || !data.customerName.trim() || !/^\\+?[0-9 -]{10,18}$/.test(data.phone.trim())) {
      this.bookingFeedback = 'Please select at least one service, date and time, and enter your name and a valid phone number.';
      return;
    }
    if (data.date < this.today || (data.date === this.today && data.time <= this.currentTime())) {
      this.bookingFeedback = 'Please select a future appointment time.';
      return;
    }
    this.bookingBusy = true;
    this.bookingApi.checkAvailability({
      service: names.join(', '), serviceNames: names, date: data.date, time: data.time,
      duration, serviceLocation: 'Salon'
    }).subscribe({
      next: availability => {
        if (!availability.available) {
          this.bookingBusy = false;
          this.bookingFeedback = availability.message || 'This time is unavailable. Please choose another.';
          return;
        }
        const barber = availability.eligibleBarbers[0];
        if (!barber) {
          this.bookingBusy = false;
          this.bookingFeedback = 'No stylist is available at this time. Please choose another slot.';
          return;
        }
        this.bookingApi.createOnline([{
          customerName: data.customerName.trim(), phone: data.phone.trim(),
          service: names.join(', '), duration, barber,
          date: data.date, time: data.time, amount,
          notes: '', groupSize: 1, serviceLocation: 'Salon', serviceAddress: '',
          specialService: '', specialServiceAmount: 0, serviceNames: names
        }]).subscribe({
          next: result => {
            this.bookingBusy = false;
            this.bookingSucceeded = result.success;
            this.bookingFeedback = result.message || (result.success ? 'Your appointment has been booked.' : 'Unable to complete booking.');
            if (result.success) this.appointment = { serviceIds: [], date: '', time: '', customerName: '', phone: '' };
          },
          error: error => {
            this.bookingBusy = false;
            this.bookingFeedback = error?.error?.message || 'We could not complete your booking. Please try again.';
          }
        });
      },
      error: error => {
        this.bookingBusy = false;
        this.bookingFeedback = error?.error?.message || 'Availability could not be checked. Please try again.';
      }
    });
  }

  private currentTime(): string {
    const date = new Date();
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  get availableServices(): AdminService[] { return this.services; }

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
  serviceTheme(service: AdminService): string {
    const category = this.categoryName(service).toLowerCase();
    const name = service.name.toLowerCase();
    if (category.includes('bridal') || /bride|walima|mehndi/.test(name)) return 'bridal';
    if (category.includes('nail') || /manicure|pedicure|polish/.test(name)) return 'nails';
    if (category.includes('skin') || /facial|cleanup|hydra/.test(name)) return 'skin';
    if (category.includes('makeup') || /glam/.test(name)) return 'makeup';
    if (category.includes('body') || /wax|thread/.test(name)) return 'body';
    return 'hair';
  }
  hasServiceImage(service: AdminService): boolean {
    return !!service.image?.trim();
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
