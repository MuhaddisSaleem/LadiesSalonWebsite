import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AdminShellComponent } from '../shared/admin-shell.component';
import { AdminNotification, NotificationService } from './notification.service';

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [CommonModule, AdminShellComponent],
  templateUrl: './admin-notifications.component.html',
  styleUrl: './admin-notifications.component.scss'
})
export class AdminNotificationsComponent {
  activeFilter: 'all' | 'unread' = 'all';

  constructor(
    public readonly notificationService: NotificationService,
    private readonly router: Router
  ) {}

  get notifications(): AdminNotification[] {
    return this.activeFilter === 'unread'
      ? this.notificationService.notifications.filter(item => item.unread)
      : this.notificationService.notifications;
  }

  get currentDateLabel(): string {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }).format(new Date());
  }

  setFilter(filter: 'all' | 'unread'): void {
    this.activeFilter = filter;
  }

  openNotification(notification: AdminNotification): void {
    this.notificationService.markAsRead(notification.id);

    if (notification.url) {
      void this.router.navigateByUrl(notification.url);
    }
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  refresh(): void {
    this.notificationService.refresh();
  }

  clearAll(): void {
    if (!this.notificationService.notifications.length) return;
    if (!window.confirm('Clear all notifications? This cannot be undone.')) return;
    this.notificationService.clearAll();
  }
}
