import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
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
  readonly times = Array.from({length:27},(_,i)=>{
    const minutes = 9 * 60 + i * 30;
    return String(Math.floor(minutes / 60)).padStart(2,'0') + ':' + String(minutes % 60).padStart(2,'0');
  });

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
  remove(id: number): void { if (!this.bookingBusy) this.selection.toggle(id); }
  toggle(id: number): void { if (!this.bookingBusy) this.selection.toggle(id); }
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
    const selected = this.selectedServices;
    const {date,time,customerName,phone} = this.form;
    if (!selected.length || !date || !time || !customerName.trim() || !/^\\+?[0-9 -]{10,18}$/.test(phone.trim())) {
      this.message = 'Select services, date, time and enter a valid name and phone number.';
      return;
    }
    if (date < this.today || (date === this.today && time <= this.currentTime())) {
      this.message = 'Choose a future appointment date and time.';
      return;
    }

    this.bookingBusy = true;
    const names = selected.map(s => s.name);
    this.bookingApi.createOnline([{
      customerName:customerName.trim(), phone:phone.trim(),
      service:names.join(', '), serviceNames:names, duration:this.totalDuration,
      barber:'', date,time, amount:this.total, notes:'', groupSize:1,
      serviceLocation:'Salon', serviceAddress:'', specialService:'',specialServiceAmount:0
    }]).subscribe({
      next:result=>{
        this.bookingBusy = false;
        this.bookingSucceeded = result.success;
        this.message = result.message || (result.success ? 'Appointment booked successfully.' : 'Booking could not be completed.');
        if(result.success) {
          this.selection.clear();
          this.form={date:'',time:'',customerName:'',phone:''};
        }
      },
      error:error=>{
        this.bookingBusy=false;
        this.message=error?.error?.message || 'Unable to complete the booking. Please try another time.';
      }
    });
  }
}
