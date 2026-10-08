import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ReportsApiService,
  ReportsOverview,
  ReportBookingRow
} from '../../core/reports-api.service';
import { BookingStatus } from '../bookings/admin-booking.service';
import { AdminSettingsService } from '../settings/admin-settings.service';
import { AdminShellComponent } from '../shared/admin-shell.component';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  templateUrl: './admin-reports.component.html',
  styleUrl: './admin-reports.component.scss'
})
export class AdminReportsComponent implements OnInit {
  dateFrom = this.firstDayOfMonth();
  dateTo = this.todayKey();
  selectedBarber = 'All';
  selectedStatus: 'All' | BookingStatus = 'All';

  report: ReportsOverview | null = null;
  loading = true;
  errorMessage = '';
  lastRefreshedAt: Date | null = null;
  private reportRequestId = 0;

  constructor(
    private readonly reportsApi: ReportsApiService,
    private readonly settingsService: AdminSettingsService
  ) {}

  ngOnInit(): void {
    this.loadReport();
  }

  get filterBarbers(): string[] {
    return this.report?.barbers ?? [];
  }

  get filteredBookings(): ReportBookingRow[] {
    return this.report?.bookings ?? [];
  }

  get totalBookings(): number {
    return Number(this.report?.summary.totalBookings) || 0;
  }

  get completedBookings(): number {
    return Number(this.report?.summary.completedBookings) || 0;
  }

  get cancelledBookings(): number {
    return Number(this.report?.summary.cancelledBookings) || 0;
  }

  get bookedValue(): number {
    return Number(this.report?.summary.bookedValue) || 0;
  }

  get completedRevenue(): number {
    return Number(this.report?.summary.completedRevenue) || 0;
  }

  get averageCompletedTicket(): number {
    return Math.round(Number(this.report?.summary.averageCompletedTicket) || 0);
  }

  get completionRate(): number {
    return Number(this.report?.summary.completionRate) || 0;
  }

  get serviceRows() {
    return this.report?.services ?? [];
  }

  get barberRows() {
    return this.report?.barberPerformance ?? [];
  }

  get dailyRows() {
    return this.report?.daily ?? [];
  }

  get lastRefreshedLabel(): string {
    if (!this.lastRefreshedAt) return '';

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(this.lastRefreshedAt);
  }

  filtersChanged(): void {
    if (!this.dateFrom || !this.dateTo) return;

    if (this.dateTo < this.dateFrom) {
      this.reportRequestId++;
      this.loading = false;
      this.errorMessage = 'Report end date cannot be before the start date.';
      return;
    }

    this.loadReport();
  }

  loadReport(): void {
    if (!this.dateFrom || !this.dateTo) return;

    const requestId = ++this.reportRequestId;
    this.loading = true;
    this.errorMessage = '';

    this.reportsApi.getReport(
      this.dateFrom,
      this.dateTo,
      this.selectedBarber,
      this.selectedStatus
    ).subscribe({
      next: response => {
        if (requestId !== this.reportRequestId) return;

        this.report = response;
        this.loading = false;
        this.lastRefreshedAt = new Date();
      },
      error: error => {
        if (requestId !== this.reportRequestId) return;

        this.loading = false;
        this.errorMessage = (error as any)?.error?.message
          || (error as any)?.error?.detail
          || 'Could not load the report. Please try again.';
      }
    });
  }

  resetFilters(): void {
    this.dateFrom = this.firstDayOfMonth();
    this.dateTo = this.todayKey();
    this.selectedBarber = 'All';
    this.selectedStatus = 'All';
    this.loadReport();
  }

  exportCsv(): void {
    const rows = [
      ['Date', 'Booking ID', 'Customer', 'Phone', 'Service', 'Barber', 'Status', 'Amount'],
      ...this.filteredBookings.map(item => [
        item.date,
        item.code,
        item.customerName,
        item.phone,
        item.service,
        item.barber,
        item.status,
        String(item.amount)
      ])
    ];

    const csv = rows
      .map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;

    const businessSlug = (this.settingsService.current.businessName || 'salon')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'salon';

    anchor.download = businessSlug + '-report-' + this.dateFrom + '-to-' + this.dateTo + '.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private firstDayOfMonth(): string {
    const date = this.settingsService.salonNow();
    date.setDate(1);
    return this.toDateKey(date);
  }

  private todayKey(): string {
    return this.toDateKey(this.settingsService.salonNow());
  }

  private toDateKey(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }
}
