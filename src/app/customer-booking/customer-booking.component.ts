import { Component } from '@angular/core';
import { BookingComponent } from '../booking/booking.component';
import { HeaderComponent } from '../header/header.component';
import { HeroComponent } from '../hero/hero.component';
import { FooterComponent } from '../footer/footer.component';
import { WhatsappFloatComponent } from '../whatsapp-float/whatsapp-float.component';

@Component({
  selector: 'app-customer-booking',
  standalone: true,
  imports: [HeaderComponent, HeroComponent, BookingComponent, FooterComponent, WhatsappFloatComponent],
  template: `
    <app-header></app-header>
    <app-hero></app-hero>
    <div id="booking">
      <app-booking></app-booking>
    </div>
    <app-footer></app-footer>
    <app-whatsapp-float></app-whatsapp-float>
  `
})
export class CustomerBookingComponent {}
