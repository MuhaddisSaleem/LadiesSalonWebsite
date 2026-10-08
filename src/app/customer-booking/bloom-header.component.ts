import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-bloom-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './bloom-header.component.html',
  styleUrls: ['./customer-booking.component.scss']
})
export class BloomHeaderComponent {
  menuOpen = false;

  openBooking(): void {
    this.menuOpen = false;
    const section = document.getElementById('appointment');
    section?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
    section?.focus({ preventScroll: true });
  }
}
