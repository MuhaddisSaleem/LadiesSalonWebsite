import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  DashboardApiService,
  DashboardOverview
} from '../core/dashboard-api.service';
import { BookingStatus } from './bookings/admin-booking.service';
import { AdminSettingsService } from './settings/admin-settings.service';
import { AdminShellComponent } from './shared/admin-shell.component';

interface DashboardStat {
  label: string;
  value: string;
  detail: string;
  trend: string;
  icon: string;
}

interface DashboardAppointmentView {
  time: string;
  customer: string;
  service: string;
  barber: string;
  price: number;
  status: BookingStatus;
  initials: string;
}

interface DashboardCustomerView {
  name: string;
  phone: string;
  visits: number;
  spend: number;
  initials: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, AdminShellComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  activeStatus: 'All' | BookingStatus = 'All';
  dashboard: DashboardOverview | null = null;
  loading = true;
  errorMessage = '';
  lastRefreshedAt: Date | null = null;

  readonly appointmentStatuses: Array<'All' | BookingStatus> = [
    'All',
    'Confirmed',
    'Pending',
    'Completed',
    'Cancelled'
  ];

  constructor(
    private readonly router: Router,
    private readonly dashboardApi: DashboardApiService,
    public readonly settingsService: AdminSettingsService
  ) {}

  ngOnInit(): void {
    this.refreshDashboard();
  }

  get greeting(): string {
    const hour = this.settingsService.salonNow().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  get currentDateLabel(): string {
    const value = this.dashboard?.today;
    const date = value ? new Date(value + 'T12:00:00') : this.settingsService.salonNow();

    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  get businessName(): string {
    return this.dashboard?.businessName
      || this.settingsService.current.businessName
      || 'Salon';
  }

  get stats(): DashboardStat[] {
    const summary = this.dashboard?.summary;

    return [
      {
        label: 'Today\'s Bookings',
        value: String(summary?.todayBookings ?? 0),
        detail: (summary?.upcomingToday ?? 0) + ' still upcoming',
        trend: this.changeLabel(summary?.todayBookings ?? 0, summary?.yesterdayBookings ?? 0),
        icon: 'bi-calendar2-check'
      },
      {
        label: 'Today\'s Revenue',
        value: 'Rs. ' + this.formatNumber(this.completedRevenueToday),
        detail: 'Rs. ' + this.formatNumber(this.todayBookedValue) + ' booked value',
        trend: this.changeLabel(this.completedRevenueToday, this.completedRevenueYesterday),
        icon: 'bi-cash-stack'
      },
      {
        label: 'Customers',
        value: String(summary?.customers ?? 0),
        detail: (summary?.newCustomersThisMonth ?? 0) + ' new this month',
        trend: this.returningCustomerRate + '% returning',
        icon: 'bi-people'
      },
      {
        label: 'Active Barbers',
        value: String(summary?.activeBarbers ?? 0),
        detail: (summary?.availableBarbers ?? 0) + ' available today',
        trend: this.barberAvailabilityRate + '% available',
        icon: 'bi-person-badge'
      }
    ];
  }

  get appointments(): DashboardAppointmentView[] {
    return (this.dashboard?.appointments ?? []).map(item => ({
      time: item.time,
      customer: item.customer,
      service: item.service,
      barber: item.barber,
      price: Number(item.price) || 0,
      status: item.status,
      initials: this.initials(item.customer)
    }));
  }

  get filteredAppointments(): DashboardAppointmentView[] {
    return this.activeStatus === 'All'
      ? this.appointments
      : this.appointments.filter(item => item.status === this.activeStatus);
  }

  get completedRevenueToday(): number {
    return Number(this.dashboard?.revenue.completedToday) || 0;
  }

  get completedRevenueYesterday(): number {
    return Number(this.dashboard?.revenue.completedYesterday) || 0;
  }

  get todayBookedValue(): number {
    return Number(this.dashboard?.revenue.bookedToday) || 0;
  }

  get todayOpenValue(): number {
    return Number(this.dashboard?.revenue.openToday) || 0;
  }

  get averageBookingToday(): number {
    return Math.round(Number(this.dashboard?.revenue.averageBookingToday) || 0);
  }

  get revenueProgress(): number {
    if (!this.todayBookedValue) return 0;
    return Math.min(100, Math.round((this.completedRevenueToday / this.todayBookedValue) * 100));
  }

  get revenueTrendLabel(): string {
    return this.changeLabel(this.completedRevenueToday, this.completedRevenueYesterday) + ' vs yesterday';
  }

  get barberLoad() {
    return (this.dashboard?.barberLoad ?? []).map(item => ({
      name: item.name,
      value: Number(item.percent) || 0,
      appointments: Number(item.appointments) || 0,
      available: item.available
    }));
  }

  get overallBarberLoad(): number {
    const available = this.barberLoad.filter(item => item.available);
    if (!available.length) return 0;

    return Math.round(
      available.reduce((sum, item) => sum + item.value, 0) / available.length
    );
  }

  get topServices() {
    return (this.dashboard?.topServices ?? []).map(item => ({
      ...item,
      bookings: Number(item.bookings) || 0,
      percent: Number(item.percent) || 0,
      revenue: Number(item.revenue) || 0
    }));
  }

  get recentCustomers(): DashboardCustomerView[] {
    return (this.dashboard?.recentCustomers ?? []).map(customer => ({
      name: customer.name,
      phone: customer.phone,
      visits: Number(customer.visits) || 0,
      spend: Number(customer.spend) || 0,
      initials: this.initials(customer.name)
    }));
  }

  get returningCustomerRate(): number {
    const summary = this.dashboard?.summary;
    if (!summary?.customers) return 0;
    return Math.round((summary.returningCustomers / summary.customers) * 100);
  }

  get barberAvailabilityRate(): number {
    const summary = this.dashboard?.summary;
    if (!summary?.activeBarbers) return 0;
    return Math.round((summary.availableBarbers / summary.activeBarbers) * 100);
  }

  get lastRefreshedLabel(): string {
    if (!this.lastRefreshedAt) return '';

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(this.lastRefreshedAt);
  }

  refreshDashboard(): void {
    if (this.loading && this.dashboard) return;

    this.loading = true;
    this.errorMessage = '';

    this.dashboardApi.getOverview().subscribe({
      next: response => {
        this.dashboard = response;
        this.loading = false;
        this.lastRefreshedAt = new Date();
      },
      error: error => {
        this.loading = false;
        this.errorMessage = (error as any)?.error?.detail
          || (error as any)?.error?.message
          || 'Could not load dashboard data. Please try again.';
      }
    });
  }

  setStatus(status: 'All' | BookingStatus): void {
    this.activeStatus = status;
  }

  goToBookings(): void {
    void this.router.navigateByUrl('/admin/bookings');
  }

  goToReports(): void {
    void this.router.navigateByUrl('/admin/reports');
  }

  goToCustomers(): void {
    void this.router.navigateByUrl('/admin/customers');
  }

  private changeLabel(current: number, previous: number): string {
    if (!previous) return current ? 'New' : '0%';

    const percent = Math.round(((current - previous) / previous) * 100);
    return (percent > 0 ? '+' : '') + percent + '%';
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
  }

  private initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'C';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
}
