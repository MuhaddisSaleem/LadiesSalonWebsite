import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import { CatalogApiService } from '../core/catalog-api.service';
import { BookingApiService } from '../core/booking-api.service';
import { AppointmentSelectionService } from '../core/appointment-selection.service';
import type { AdminService, AdminServiceCategory } from '../admin/services/admin-service.service';

@Component({
  selector: 'app-appointment-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HeaderComponent, FooterComponent],
  templateUrl: './appointment-page.component.html',
  styleUrls: ['./appointment-page.component.scss']
})
export class AppointmentPageComponent implements OnInit {
  services: AdminService[] = [];
  categories: AdminServiceCategory[] = [];
  loading = true;
  loadError = '';
  bookingBusy = false;
  bookingSucceeded = false;
  message = '';
  serviceSearch = '';
  form = { date: '', time: '', customerName: '', phone: '' };
  readonly today = this.localDate(new Date());
  availabilityBusy = false;
  availabilityMessage = '';
  availableStylist = '';
  private availabilityRequest?: Subscription;
  private availabilityVersion = 0;
  get times(): string[] {
    // Use the selected treatment duration as the slot step; avoid 30-minute
    // options for bookings that occupy longer contiguous windows.
    const step = Math.max(15, Math.min(120, this.totalDuration || 30));
    const values: string[] = [];
    for (let minute = 9 * 60; minute <= 22 * 60 - Math.max(15, this.totalDuration); minute += step) {
      const hh = String(Math.floor(minute / 60)).padStart(2, '0');
      const mm = String(minute % 60).padStart(2, '0');
      const t = hh + ':' + mm;
      if (this.form.date !== this.today || t > this.currentTime()) values.push(t);
    }
    return values;
  }

  constructor(
    private readonly catalog: CatalogApiService,
    private readonly bookingApi: BookingApiService,
    public readonly selection: AppointmentSelectionService
  ) {}

  ngOnInit(): void {
    forkJoin({ services: this.catalog.getServices(), categories: this.catalog.getServiceCategories() }).subscribe({
      next: ({ services, categories }) => {
        const inactive = new Set(categories.filter(c => c.status !== 'Active').map(c => c.id));
        this.services = services.filter(s => s.status === 'Active' && !inactive.has(s.categoryId));
        this.categories = categories.filter(c => c.status === 'Active');
        // Do not retain services deactivated by the admin.
        for (const id of this.selection.selectedIds) {
          if (!this.services.some(s => s.id === id)) this.selection.toggle(id);
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.loadError = 'Unable to load services. Please retry.';
      }
    });
  }

  get selectedServices(): AdminService[] {
    return this.services.filter(s => this.selection.selectedIds.includes(s.id));
  }
  get filteredServices(): AdminService[] {
    const query = this.serviceSearch.trim().toLowerCase();
    return this.services.filter(s => !query || s.name.toLowerCase().includes(query));
  }
  get total(): number { return this.selectedServices.reduce((sum, s) => sum + this.price(s), 0); }
  get totalDuration(): number { return this.selectedServices.reduce((sum, s) => sum + s.duration, 0); }
  price(s: AdminService): number {
    return s.discountPrice != null && s.discountPrice >= 0 && s.discountPrice < s.originalPrice
      ? s.discountPrice : s.originalPrice;
  }
  remove(id: number): void { if (!this.bookingBusy) { this.selection.toggle(id); this.resetAvailability(); this.form.time = ''; } }
  toggle(id: number): void { if (!this.bookingBusy) { this.selection.toggle(id); this.resetAvailability(); this.form.time = ''; } }
  onDateChange(): void { this.form.time = ''; this.resetAvailability(); }
  private resetAvailability(): void {
    this.availabilityVersion++;
    this.availabilityRequest?.unsubscribe();
    this.availabilityBusy = false;
    this.availableStylist = '';
    this.availabilityMessage = '';
  }
  checkSelectedTime(): void {
    this.resetAvailability();
    if (!this.selectedServices.length || !this.form.date || !this.form.time) return;
    const date = this.form.date;
    const time = this.form.time;
    if (date < this.today || (date === this.today && time <= this.currentTime())) {
      this.availabilityMessage = 'Choose a future date and time.';
      return;
    }
    const version = this.availabilityVersion;
    const names = this.selectedServices.map(s => s.name);
    this.availabilityBusy = true;
    this.availabilityRequest = this.bookingApi.checkAvailability({
      service: names.join(', '), serviceNames: names,
      date, time, duration: this.totalDuration, serviceLocation: 'Salon'
    }).subscribe({
      next: result => {
        if (version !== this.availabilityVersion) return;
        this.availabilityBusy = false;
        this.availableStylist = result.available ? (result.eligibleBarbers[0] || '') : '';
        this.availabilityMessage = result.available && this.availableStylist
          ? 'Available — a stylist can take your appointment.'
          : (result.message || 'This slot is not available. Please choose another time.');
      },
      error: () => {
        if (version !== this.availabilityVersion) return;
        this.availabilityBusy = false;
        this.availabilityMessage = 'Could not verify availability. Please select the time again.';
      }
    });
  }
  private localDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  private currentTime(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  submit(): void {
    if (this.bookingBusy) return;
    this.message = '';
    this.bookingSucceeded = false;
    if (this.availabilityBusy || !this.availableStylist) {
      this.message = 'Please choose a time and wait for availability confirmation.';
      return;
    }
    const selected = this.selectedServices;
    const { date, time, customerName, phone } = this.form;
    if (!selected.length || !date || !time || !customerName.trim() || !/^\+?[0-9 -]{10,18}$/.test(phone.trim())) {
      this.message = 'Select services, date, time and enter a valid name and phone number.';
      return;
    }
    if (date < this.today || (date === this.today && time <= this.currentTime())) {
      this.message = 'Choose a future appointment date and time.';
      return;
    }
    this.bookingBusy = true;
    const names = selected.map(s => s.name);
    this.bookingApi.checkAvailability({
      service: names.join(', '), serviceNames: names, date, time,
      duration: this.totalDuration, serviceLocation: 'Salon'
    }).subscribe({
      next: availability => {
        if (!availability.available || !availability.eligibleBarbers.length) {
          this.bookingBusy = false;
          this.message = availability.message || 'No stylist is available at that time.';
          return;
        }
        this.bookingApi.createOnline([{
          customerName: customerName.trim(), phone: phone.trim(), service: names.join(', '),
          serviceNames: names, duration: this.totalDuration, barber: availability.eligibleBarbers[0],
          date, time, amount: this.total, notes: '', groupSize: 1, serviceLocation: 'Salon',
          serviceAddress: '', specialService: '', specialServiceAmount: 0
        }]).subscribe({
          next: result => {
            this.bookingBusy = false;
            this.bookingSucceeded = result.success;
            this.message = result.message || (result.success ? 'Appointment booked successfully.' : 'Booking was not completed.');
            if (result.success) {
              this.resetAvailability();
              this.selection.clear();
              this.form = { date: '', time: '', customerName: '', phone: '' };
            }
          },
          error: error => {
            this.bookingBusy = false;
            this.message = error?.error?.message || 'Unable to complete booking. Please try again.';
          }
        });
      },
      error: error => {
        this.bookingBusy = false;
        this.message = error?.error?.message || 'Availability check failed. Please try again.';
      }
    });
  }
}
