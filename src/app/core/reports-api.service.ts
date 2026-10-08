import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type ReportBookingStatus = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';

export interface ReportsSummary {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  bookedValue: number;
  completedRevenue: number;
  averageCompletedTicket: number;
  completionRate: number;
}

export interface ServiceReportRow {
  name: string;
  bookings: number;
  completed: number;
  value: number;
  percent: number;
}

export interface BarberReportRow {
  name: string;
  bookings: number;
  completed: number;
  cancelled: number;
  value: number;
  percent: number;
}

export interface DailyReportRow {
  date: string;
  bookings: number;
  completed: number;
  cancelled: number;
  revenue: number;
  bookedValue: number;
}

export interface ReportBookingRow {
  id: number;
  code: string;
  customerName: string;
  phone: string;
  service: string;
  barber: string;
  date: string;
  time: string;
  status: ReportBookingStatus;
  amount: number;
}

export interface ReportsOverview {
  dateFrom: string;
  dateTo: string;
  barbers: string[];
  summary: ReportsSummary;
  services: ServiceReportRow[];
  barberPerformance: BarberReportRow[];
  daily: DailyReportRow[];
  bookings: ReportBookingRow[];
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly baseUrl = '/api/reports';

  constructor(private readonly http: HttpClient) {}

  getReport(
    from: string,
    to: string,
    barber: string,
    status: string
  ): Observable<ReportsOverview> {
    let params = new HttpParams()
      .set('from', from)
      .set('to', to);

    if (barber && barber !== 'All') {
      params = params.set('barber', barber);
    }

    if (status && status !== 'All') {
      params = params.set('status', status);
    }

    return this.http.get<ReportsOverview>(this.baseUrl, { params });
  }
}
