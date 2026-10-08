import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AdminBooking, AdminBookingService } from '../bookings/admin-booking.service';
import {
  CustomerApiService,
  CustomerMutationResult,
  CustomerProfileUpdate
} from '../../core/customer-api.service';

export type CustomerType = 'New' | 'Returning';

export interface AdminCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  bookingCount: number;
  completedVisits: number;
  cancelledCount: number;
  totalSpend: number;
  lastVisit: string | null;
  nextBooking: AdminBooking | null;
  customerType: CustomerType;
  firstBookingDate: string;
  lastBookingDate: string;
  notes: string;
  bookings: AdminBooking[];
}

@Injectable({ providedIn: 'root' })
export class AdminCustomerService {
  private customers: AdminCustomer[] = [];

  loading = false;
  errorMessage = '';

  constructor(
    private readonly api: CustomerApiService,
    private readonly bookingService: AdminBookingService
  ) {
    this.refresh();

    // Booking changes can change customer counts, spend, next appointment and history.
    this.bookingService.changes$.subscribe(() => this.refresh());
  }

  get all(): AdminCustomer[] {
    return this.customers;
  }

  getById(id: string): AdminCustomer | undefined {
    return this.customers.find(item => item.id === id);
  }

  bookingsForCustomer(customer: AdminCustomer): AdminBooking[] {
    return [...customer.bookings]
      .sort((a, b) =>
        b.date.localeCompare(a.date) || this.timeToMinutes(b.time) - this.timeToMinutes(a.time)
      );
  }

  updateProfile(
    customerId: string,
    profile: CustomerProfileUpdate
  ): Observable<CustomerMutationResult> {
    return this.api.updateProfile(customerId, profile).pipe(
      tap(result => {
        if (!result.success || !result.customer) return;

        const normalized = this.normalizeCustomer(result.customer);
        const index = this.customers.findIndex(item => item.id === customerId);

        if (index >= 0) {
          this.customers = [
            ...this.customers.slice(0, index),
            normalized,
            ...this.customers.slice(index + 1)
          ];
        } else {
          this.customers = [normalized, ...this.customers];
        }
      })
    );
  }

  saveNote(customerId: string, note: string): Observable<CustomerMutationResult> {
    return this.api.saveNote(customerId, note.trim()).pipe(
      tap(result => {
        if (!result.success || !result.customer) return;

        const normalized = this.normalizeCustomer(result.customer);
        const index = this.customers.findIndex(item => item.id === customerId);

        if (index >= 0) {
          this.customers = [
            ...this.customers.slice(0, index),
            normalized,
            ...this.customers.slice(index + 1)
          ];
        } else {
          this.customers = [normalized, ...this.customers];
        }
      })
    );
  }

  refresh(): void {
    this.loading = true;
    this.errorMessage = '';

    this.api.getAll().subscribe({
      next: customers => {
        this.customers = Array.isArray(customers)
          ? customers.map(item => this.normalizeCustomer(item))
          : [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Could not load customers from the database.';
      }
    });
  }

  private normalizeCustomer(customer: AdminCustomer): AdminCustomer {
    return {
      ...customer,
      bookingCount: Number(customer.bookingCount) || 0,
      completedVisits: Number(customer.completedVisits) || 0,
      cancelledCount: Number(customer.cancelledCount) || 0,
      totalSpend: Number(customer.totalSpend) || 0,
      email: customer.email || '',
      notes: customer.notes || '',
      bookings: Array.isArray(customer.bookings)
        ? customer.bookings.map(booking => this.normalizeBooking(booking))
        : [],
      nextBooking: customer.nextBooking
        ? this.normalizeBooking(customer.nextBooking)
        : null,
      customerType: customer.customerType === 'Returning' ? 'Returning' : 'New'
    };
  }

  private normalizeBooking(booking: AdminBooking): AdminBooking {
    return {
      ...booking,
      id: Number(booking.id),
      duration: Number(booking.duration) || 0,
      amount: Number(booking.amount) || 0,
      groupSize: Number(booking.groupSize) || 1,
      specialServiceAmount: Number(booking.specialServiceAmount) || 0
    };
  }

  private timeToMinutes(time: string): number {
    const match = time.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
    if (!match) return 0;

    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const period = match[3].toUpperCase();

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    return hour * 60 + minute;
  }
}
