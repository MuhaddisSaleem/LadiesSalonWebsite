import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-customer-booking',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './customer-booking.component.html',
  styleUrls: ['./customer-booking.component.scss']
})
export class CustomerBookingComponent {
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
  showBridal = false;
  get filteredCollections() { return this.collections.filter(item => this.activeFilter === 'All' || item.category === this.activeFilter); }
  openBooking(): void {
    this.menuOpen = false;
    const section = document.getElementById('appointment');
    section?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    section?.focus({ preventScroll: true });
  }
}
