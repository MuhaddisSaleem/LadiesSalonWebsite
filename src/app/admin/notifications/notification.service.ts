import { Injectable } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import {
  CreateNotificationApiRequest,
  NotificationApiRecord,
  NotificationApiService
} from '../../core/notification-api.service';

export type NotificationType =
  | 'booking'
  | 'payment'
  | 'cancelled'
  | 'rescheduled'
  | 'reminder'
  | 'system';

export interface AdminNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  dateLabel: string;
  createdAt: string;
  icon: string;
  unread: boolean;
  url?: string;
}

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  icon: string;
  url?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly maxItems = 100;
  private readonly liveRefreshMs = 5000;
  private items: AdminNotification[] = [];
  private localCounter = 0;
  private liveRefreshTimer?: number;
  private refreshInFlight = false;
  private activeUserId = '';
  private hasNotificationBaseline = false;
  private knownNotificationIds = new Set<string>();
  private audioContext?: AudioContext;
  private liveBookingAlertTimer?: number;

  loading = false;
  errorMessage = '';
  liveBookingAlert: AdminNotification | null = null;

  constructor(
    private readonly api: NotificationApiService,
    private readonly auth: AuthService
  ) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('royal-barbers.admin-notifications.v1');

      // Browsers may block sound until the page has received a user gesture.
      // Quietly prepare the audio context on normal admin interaction.
      const unlockAudio = () => this.unlockBookingSound();
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio);

      window.addEventListener('focus', () => {
        if (this.auth.isAuthenticated()) this.refresh(true);
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.auth.isAuthenticated()) {
          this.refresh(true);
        }
      });
    }

    this.auth.currentUser$.subscribe(user => {
      if (user && this.auth.isAuthenticated()) {
        if (this.activeUserId !== user.id) {
          this.activeUserId = user.id;
          this.hasNotificationBaseline = false;
          this.knownNotificationIds.clear();
        }

        this.refresh();
        this.startLiveUpdates();
      } else {
        this.stopLiveUpdates();
        this.activeUserId = '';
        this.hasNotificationBaseline = false;
        this.knownNotificationIds.clear();
        this.items = [];
        this.liveBookingAlert = null;
        if (this.liveBookingAlertTimer !== undefined && typeof window !== 'undefined') {
          window.clearTimeout(this.liveBookingAlertTimer);
          this.liveBookingAlertTimer = undefined;
        }
        this.loading = false;
        this.refreshInFlight = false;
        this.errorMessage = '';
      }
    });
  }

  get notifications(): AdminNotification[] {
    return this.items;
  }

  get unreadCount(): number {
    return this.items.filter(item => item.unread).length;
  }

  get previewNotifications(): AdminNotification[] {
    return this.items.slice(0, 5);
  }

  refresh(silent = false): void {
    if (!this.auth.isAuthenticated()) {
      this.items = [];
      return;
    }

    if (this.refreshInFlight) return;

    this.refreshInFlight = true;
    if (!silent) {
      this.loading = true;
      this.errorMessage = '';
    }

    this.api.getAll().subscribe({
      next: notifications => {
        const nextItems = (Array.isArray(notifications) ? notifications : [])
          .map(item => this.normalize(item))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, this.maxItems);

        this.handleLiveNotifications(nextItems);
        this.items = nextItems;
        this.refreshInFlight = false;
        this.loading = false;
      },
      error: () => {
        this.refreshInFlight = false;
        this.loading = false;
        if (!silent) this.errorMessage = 'Could not load notifications.';
      }
    });
  }

  add(input: CreateNotificationInput): AdminNotification {
    const optimistic = this.createOptimistic(input);

    if (!this.auth.isAuthenticated()) {
      return optimistic;
    }

    this.items = [optimistic, ...this.items].slice(0, this.maxItems);
    this.errorMessage = '';

    const request: CreateNotificationApiRequest = {
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      icon: input.icon,
      url: input.url
    };

    this.api.create(request).subscribe({
      next: result => {
        if (!result.success || !result.notification) {
          this.removeOptimistic(optimistic.id);
          this.errorMessage = result.message || 'Could not save notification.';
          return;
        }

        const persisted = this.normalize(result.notification);
        const pending = this.items.find(item => item.id === optimistic.id);
        const optimisticWasRead = pending?.unread === false;

        this.items = [
          persisted,
          ...this.items.filter(item => item.id !== optimistic.id && item.id !== persisted.id)
        ]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, this.maxItems);

        if (optimisticWasRead) {
          this.markAsRead(persisted.id);
        }
      },
      error: () => {
        this.removeOptimistic(optimistic.id);
        this.errorMessage = 'The business action succeeded, but its notification could not be saved.';
      }
    });

    return optimistic;
  }

  markAsRead(id: string): void {
    const item = this.items.find(notification => notification.id === id);
    if (!item || !item.unread) return;

    item.unread = false;

    if (id.startsWith('local-') || !this.auth.isAuthenticated()) return;

    this.api.markAsRead(id).subscribe({
      error: () => {
        item.unread = true;
        this.errorMessage = 'Could not mark the notification as read.';
      }
    });
  }

  markAllAsRead(): void {
    const unread = this.items.filter(item => item.unread);
    if (!unread.length) return;

    unread.forEach(item => item.unread = false);

    if (!this.auth.isAuthenticated()) return;

    this.api.markAllAsRead().subscribe({
      error: () => {
        unread.forEach(item => item.unread = true);
        this.errorMessage = 'Could not mark all notifications as read.';
      }
    });
  }

  clearAll(): void {
    if (!this.items.length) return;

    const previous = [...this.items];
    this.items = [];

    if (!this.auth.isAuthenticated()) return;

    this.api.clearAll().subscribe({
      error: () => {
        this.items = previous;
        this.errorMessage = 'Could not clear notifications.';
      }
    });
  }

  private startLiveUpdates(): void {
    if (typeof window === 'undefined' || this.liveRefreshTimer !== undefined) return;

    this.liveRefreshTimer = window.setInterval(() => {
      if (
        this.auth.isAuthenticated()
        && document.visibilityState === 'visible'
      ) {
        this.refresh(true);
      }
    }, this.liveRefreshMs);
  }

  private stopLiveUpdates(): void {
    if (typeof window === 'undefined' || this.liveRefreshTimer === undefined) return;
    window.clearInterval(this.liveRefreshTimer);
    this.liveRefreshTimer = undefined;
  }

  private handleLiveNotifications(nextItems: AdminNotification[]): void {
    const persisted = nextItems.filter(item => !item.id.startsWith('local-'));

    // The first successful fetch is only a baseline. Existing unread items should
    // show their badge but must never make noise just because admin logged in/refreshed.
    if (!this.hasNotificationBaseline) {
      this.knownNotificationIds = new Set(persisted.map(item => item.id));
      this.hasNotificationBaseline = true;
      return;
    }

    const newOnlineBooking = persisted.find(item =>
      !this.knownNotificationIds.has(item.id)
      && item.unread
      && item.type === 'booking'
      && /^(New online booking|New group booking)$/i.test(item.title.trim())
    );

    persisted.forEach(item => this.knownNotificationIds.add(item.id));

    if (newOnlineBooking) {
      this.showLiveBookingAlert(newOnlineBooking);
      this.playBookingSound();
    }
  }

  dismissLiveBookingAlert(): void {
    this.liveBookingAlert = null;

    if (this.liveBookingAlertTimer !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(this.liveBookingAlertTimer);
      this.liveBookingAlertTimer = undefined;
    }
  }

  private showLiveBookingAlert(notification: AdminNotification): void {
    this.liveBookingAlert = notification;

    if (typeof window === 'undefined') return;

    if (this.liveBookingAlertTimer !== undefined) {
      window.clearTimeout(this.liveBookingAlertTimer);
    }

    this.liveBookingAlertTimer = window.setTimeout(() => {
      if (this.liveBookingAlert?.id === notification.id) {
        this.liveBookingAlert = null;
      }
      this.liveBookingAlertTimer = undefined;
    }, 9000);
  }

  private unlockBookingSound(): void {
    if (typeof window === 'undefined') return;

    try {
      const AudioContextCtor = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextCtor) return;

      this.audioContext ??= new AudioContextCtor();

      if (this.audioContext.state === 'suspended') {
        void this.audioContext.resume().catch(() => undefined);
      }
    } catch {
      // Notification badge still works if the browser/device does not support audio.
    }
  }

  private playBookingSound(): void {
    if (typeof window === 'undefined') return;

    this.unlockBookingSound();
    const context = this.audioContext;
    if (!context) return;

    const play = () => {
      try {
        const start = context.currentTime;

        // Longer booking alert: two rising phrases over ~2.5 seconds.
        // Final loudness still respects browser/OS device volume.
        const notes = [
          { f: 659, at: 0.00, d: 0.28, v: 0.42 },
          { f: 880, at: 0.30, d: 0.30, v: 0.40 },
          { f: 1175, at: 0.62, d: 0.42, v: 0.38 },
          { f: 659, at: 1.18, d: 0.28, v: 0.42 },
          { f: 880, at: 1.48, d: 0.30, v: 0.40 },
          { f: 1318, at: 1.80, d: 0.62, v: 0.40 }
        ];

        notes.forEach(note =>
          this.playTone(context, note.f, start + note.at, note.d, note.v)
        );
      } catch {
        // Never allow notification audio to affect the admin UI.
      }
    };

    if (context.state === 'suspended') {
      void context.resume().then(play).catch(() => undefined);
      return;
    }

    play();
  }

  private playTone(
    context: AudioContext,
    frequency: number,
    start: number,
    duration: number,
    volume: number
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private createOptimistic(input: CreateNotificationInput): AdminNotification {
    const now = new Date();
    this.localCounter += 1;

    return {
      id: 'local-' + now.getTime() + '-' + this.localCounter,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      time: this.formatTime(now),
      dateLabel: this.formatDate(now),
      createdAt: now.toISOString(),
      icon: input.icon,
      unread: true,
      url: input.url
    };
  }

  private normalize(item: NotificationApiRecord): AdminNotification {
    const createdAt = new Date(item.createdAt);
    const safeDate = Number.isFinite(createdAt.getTime()) ? createdAt : new Date();

    return {
      id: String(item.id),
      type: this.isNotificationType(item.type) ? item.type : 'system',
      title: String(item.title || ''),
      message: String(item.message || ''),
      time: this.formatTime(safeDate),
      dateLabel: this.formatDate(safeDate),
      createdAt: safeDate.toISOString(),
      icon: String(item.icon || 'bi-bell'),
      unread: Boolean(item.unread),
      url: item.url ? String(item.url) : undefined
    };
  }

  private removeOptimistic(id: string): void {
    this.items = this.items.filter(item => item.id !== id);
  }

  private formatTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }

  private isNotificationType(value: string): value is NotificationType {
    return value === 'booking'
      || value === 'payment'
      || value === 'cancelled'
      || value === 'rescheduled'
      || value === 'reminder'
      || value === 'system';
  }
}
