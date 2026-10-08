import { Routes } from '@angular/router';
import { adminAuthGuard } from './core/admin-auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./customer-booking/customer-booking.component').then(m => m.CustomerBookingComponent),
    title: 'Bloom Beauty Studio'
  },
  {
    path: 'appointment',
    loadComponent: () => import('./appointment-page/appointment-page.component').then(m => m.AppointmentPageComponent),
    title: 'Book Appointment | Bloom Beauty Studio'
  },
  {
    path: 'service',
    loadComponent: () => import('./services-page/services-page.component').then(m => m.ServicesPageComponent),
    title: 'Services | Bloom Beauty Studio'
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./about-page/about-page.component').then(m => m.AboutPageComponent),
    title: 'About | The Trim Town'
  },
  {
    path: 'gallery',
    loadComponent: () =>
      import('./gallery-page/gallery-page.component').then(m => m.GalleryPageComponent),
    title: 'Gallery | The Trim Town'
  },
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./admin-login/admin-login.component').then(m => m.AdminLoginComponent),
    title: 'Admin Login'
  },
  {
    path: 'admin',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    title: 'Admin Dashboard'
  },
  {
    path: 'admin/bookings',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/bookings/admin-bookings.component').then(m => m.AdminBookingsComponent),
    title: 'Bookings'
  },
  {
    path: 'admin/calendar',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/calendar/admin-calendar.component').then(m => m.AdminCalendarComponent),
    title: 'Schedule'
  },
  {
    path: 'admin/barbers',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/barbers/admin-barbers.component').then(m => m.AdminBarbersComponent),
    title: 'Barbers'
  },
  {
    path: 'admin/services',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/services/admin-services.component').then(m => m.AdminServicesComponent),
    title: 'Services'
  },
  {
    path: 'admin/customers',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/customers/admin-customers.component').then(m => m.AdminCustomersComponent),
    title: 'Customers'
  },
  {
    path: 'admin/reports',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/reports/admin-reports.component').then(m => m.AdminReportsComponent),
    title: 'Revenue & Reports'
  },
  {
    path: 'admin/settings',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/settings/admin-settings.component').then(m => m.AdminSettingsComponent),
    title: 'Settings'
  },
  {
    path: 'admin/account-security',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/account-security/account-security.component').then(m => m.AccountSecurityComponent),
    title: 'Account & Security'
  },
  {
    path: 'admin/notifications',
    canActivate: [adminAuthGuard],
    loadComponent: () =>
      import('./admin/notifications/admin-notifications.component').then(m => m.AdminNotificationsComponent),
    title: 'Notifications'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
