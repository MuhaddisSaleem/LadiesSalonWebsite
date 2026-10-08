import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type DashboardBookingStatus = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';

export interface DashboardSummary {
  todayBookings: number;
  yesterdayBookings: number;
  upcomingToday: number;
  customers: number;
  newCustomersThisMonth: number;
  returningCustomers: number;
  activeBarbers: number;
  availableBarbers: number;
}

export interface DashboardRevenue {
  completedToday: number;
  completedYesterday: number;
  bookedToday: number;
  openToday: number;
  averageBookingToday: number;
}

export interface DashboardAppointment {
  id: number;
  time: string;
  customer: string;
  phone: string;
  service: string;
  barber: string;
  price: number;
  status: DashboardBookingStatus;
}

export interface DashboardBarberLoad {
  id: number;
  name: string;
  percent: number;
  appointments: number;
  available: boolean;
}

export interface DashboardTopService {
  name: string;
  bookings: number;
  percent: number;
  revenue: number;
}

export interface DashboardRecentCustomer {
  id: string;
  name: string;
  phone: string;
  visits: number;
  spend: number;
}

export interface DashboardOverview {
  businessName: string;
  today: string;
  summary: DashboardSummary;
  revenue: DashboardRevenue;
  appointments: DashboardAppointment[];
  barberLoad: DashboardBarberLoad[];
  topServices: DashboardTopService[];
  recentCustomers: DashboardRecentCustomer[];
}

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly baseUrl = '/api/dashboard';

  constructor(private readonly http: HttpClient) {}

  getOverview(): Observable<DashboardOverview> {
    return this.http.get<DashboardOverview>(this.baseUrl);
  }
}
