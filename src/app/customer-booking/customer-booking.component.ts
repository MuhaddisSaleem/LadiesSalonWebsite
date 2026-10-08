import { CommonModule } from '@angular/common';
import { Component, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BookingComponent } from '../booking/booking.component';
import { AdminServiceService } from '../admin/services/admin-service.service';
import { AdminBarberService } from '../admin/barbers/admin-barber.service';
import { AdminSettingsService } from '../admin/settings/admin-settings.service';

@Component({
  selector: 'app-customer-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BookingComponent],
  templateUrl: './customer-booking.component.html',
  styleUrls: ['./customer-booking.component.scss']
})
export class CustomerBookingComponent {
  @ViewChild(BookingComponent) booking?: BookingComponent;
  readonly year = new Date().getFullYear();
  readonly filters = ['All', 'Hair', 'Skin', 'Nails', 'Makeup'];
  readonly collections = [
    { name: 'Hair Styling', category: 'Hair', photo: 'hair', description: 'Polished looks for everyday elegance and special occasions.' },
    { name: 'Skin Rituals', category: 'Skin', photo: 'skin', description: 'Thoughtful skincare rituals and a little time for yourself.' },
    { name: 'Nail Care', category: 'Nails', photo: 'nails', description: 'Refined nail services for every style.' },
    { name: 'Makeup', category: 'Makeup', photo: 'makeup', description: 'Beautiful makeup that celebrates your unique style.' }
  ];
  activeFilter = 'All';
  menuOpen = false;
  showBooking = false;
  showBridal = false;
  serviceId = '';
  stylistId = '';
  date = '';
  formError = '';
  constructor(public services: AdminServiceService, public stylists: AdminBarberService, public settings: AdminSettingsService) {}
  get filteredCollections() { return this.collections.filter(item => this.activeFilter === 'All' || item.category === this.activeFilter); }
  get today(): string { return this.localDate(this.settings.salonNow()); }
  get lastDate(): string {
    const date = this.settings.salonNow();
    date.setDate(date.getDate() + this.settings.maxAdvanceDays);
    return this.localDate(date);
  }
  private localDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  findTimes(): void {
    this.formError = '';
    if (!this.services.active.some(item => item.id === Number(this.serviceId))) {
      this.formError = 'Please choose an available service.';
      return;
    }
    const date = new Date(this.date + 'T12:00:00');
    if (!this.date || Number.isNaN(date.getTime()) || !this.settings.isBookingDateAllowed(date)) {
      this.formError = 'Please choose a date within the salon booking window.';
      return;
    }
    this.showBooking = true;
    setTimeout(() => {
      const booking = this.booking;
      if (!booking) return;
      // Only seed an untouched booking; never overwrite a customer's in-progress choices.
      if (!booking.selectedServices.length) {
        const service = booking.services.find(item => item.id === Number(this.serviceId));
        if (service) booking.toggleService(service);
        booking.selectCalendarDay({ date, dayNumber: date.getDate(), fullDate: this.date });
        const stylist = booking.barbers.find(item => item.id === Number(this.stylistId));
        booking.selectBarber(stylist || 'any');
      }
      this.scrollToBooking();
    });
  }
  openBooking(): void {
    this.menuOpen = false;
    this.showBooking = true;
    setTimeout(() => this.scrollToBooking());
  }
  private scrollToBooking(): void {
    const section = document.getElementById('booking-flow');
    section?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
  }
}
