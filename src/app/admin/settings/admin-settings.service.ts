import { Injectable } from '@angular/core';
import { NotificationService } from '../notifications/notification.service';
import { CatalogApiService } from '../../core/catalog-api.service';

export interface BusinessHoursDay {
  key: string;
  label: string;
  enabled: boolean;
  open: string;
  close: string;
}

export interface AdminSettings {
  businessName: string;
  businessPhone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  city: string;
  currency: string;
  timezone: string;

  brandSubtitle: string;
  heroEyebrow: string;
  heroHeadline: string;
  heroTagline: string;

  bookingInterval: number;
  maxAdvanceDays: number;
  cancellationHours: number;
  lateArrivalMinutes: number;
  allowSameDayBooking: boolean;
  autoConfirmBookings: boolean;

  sendWhatsappConfirmation: boolean;
  sendSmsFallback: boolean;
  sendAppointmentReminder: boolean;
  reminderHoursBefore: number;
  notifyOwnerOnNewBooking: boolean;

  businessHours: BusinessHoursDay[];
}

export interface SettingsSaveResult {
  success: boolean;
  message: string;
}

const DEFAULT_HOURS: BusinessHoursDay[] = [
  { key: 'monday', label: 'Monday', enabled: true, open: '08:00', close: '21:00' },
  { key: 'tuesday', label: 'Tuesday', enabled: true, open: '08:00', close: '21:00' },
  { key: 'wednesday', label: 'Wednesday', enabled: true, open: '08:00', close: '21:00' },
  { key: 'thursday', label: 'Thursday', enabled: true, open: '08:00', close: '21:00' },
  { key: 'friday', label: 'Friday', enabled: true, open: '08:00', close: '21:00' },
  { key: 'saturday', label: 'Saturday', enabled: true, open: '08:00', close: '21:00' },
  { key: 'sunday', label: 'Sunday', enabled: true, open: '08:00', close: '21:00' }
];

const DEFAULT_SETTINGS: AdminSettings = {
  businessName: '',
  businessPhone: '',
  whatsappNumber: '',
  email: '',
  address: '',
  city: '',
  currency: 'PKR',
  timezone: 'Asia/Karachi',

  brandSubtitle: 'LOOK GOOD · FEEL GREAT',
  heroEyebrow: 'PREMIUM BARBERSHOP',
  heroHeadline: '',
  heroTagline: "More Than a Haircut. It's a Lifestyle.",

  bookingInterval: 30,
  maxAdvanceDays: 30,
  cancellationHours: 2,
  lateArrivalMinutes: 10,
  allowSameDayBooking: true,
  autoConfirmBookings: true,

  sendWhatsappConfirmation: false,
  sendSmsFallback: false,
  sendAppointmentReminder: false,
  reminderHoursBefore: 2,
  notifyOwnerOnNewBooking: true,

  businessHours: DEFAULT_HOURS
};

@Injectable({ providedIn: 'root' })
export class AdminSettingsService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly api?: CatalogApiService
  ) {
    this.settings = this.api?.settingsSnapshot
      ? this.normalizeSettings(this.api.settingsSnapshot)
      : this.loadSettings();

    this.api?.changes$.subscribe(changed => {
      if (changed === 'settings' && this.api?.settingsSnapshot) {
        this.settings = this.normalizeSettings(this.api.settingsSnapshot);
      }
    });  }

  private readonly storageKey = 'royal-barbers.admin-settings.v1';
  private settings: AdminSettings = this.clone(DEFAULT_SETTINGS);

  refreshFromStorage(): void {
    if (this.api) {
      this.refreshFromApi();
      return;
    }
    this.settings = this.loadSettings();
  }

  refreshFromApi(): void {
    if (!this.api) return;

    this.api.getSettings().subscribe({
      next: settings => {
        this.settings = this.normalizeSettings(settings);
        this.api!.settingsSnapshot = this.clone(this.settings);
      }
    });
  }

  get apiEnabled(): boolean {
    return !!this.api;
  }

  get current(): AdminSettings {
    return this.clone(this.settings);
  }

  get bookingInterval(): number {
    const value = Number(this.settings.bookingInterval);
    return Number.isInteger(value) && value >= 5 ? value : 30;
  }

  get maxAdvanceDays(): number {
    const value = Number(this.settings.maxAdvanceDays);
    return Number.isInteger(value) && value >= 1 ? value : 30;
  }

  get cancellationHours(): number {
    return Math.max(0, Number(this.settings.cancellationHours) || 0);
  }

  get lateArrivalMinutes(): number {
    return Math.max(0, Number(this.settings.lateArrivalMinutes) || 0);
  }

  // Calendar Dates below represent salon wall time; API dates/times use this same zone.
  salonNow(instant: Date = new Date()): Date {
    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: this.current.timezone || 'UTC', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      });
    } catch {
      formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      });
    }
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
    return new Date(+parts['year'], +parts['month'] - 1, +parts['day'],
      +parts['hour'], +parts['minute'], +parts['second']);
  }

  canCustomerCancel(dateKey: string, time: string, now = this.salonNow()): boolean {
    const appointment = this.bookingDateTime(dateKey, time);
    if (!appointment) return false;

    const cutoffMs = this.cancellationHours * 60 * 60 * 1000;
    return appointment.getTime() - now.getTime() >= cutoffMs;
  }

  isPastLateArrivalGrace(dateKey: string, time: string, now = this.salonNow()): boolean {
    const appointment = this.bookingDateTime(dateKey, time);
    if (!appointment) return false;

    const graceMs = this.lateArrivalMinutes * 60 * 1000;
    return now.getTime() > appointment.getTime() + graceMs;
  }

  isBookingDateAllowed(date: Date): boolean {
    const candidate = this.startOfDay(date);
    const today = this.startOfDay(this.salonNow());

    if (candidate.getTime() < today.getTime()) return false;
    if (!this.settings.allowSameDayBooking && candidate.getTime() === today.getTime()) return false;

    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + this.maxAdvanceDays);
    if (candidate.getTime() > maxDate.getTime()) return false;

    return !!this.hoursForDate(candidate);
  }

  hoursForDate(date: Date): { start: number; end: number } | null {
    const dayKey = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday'
    ][date.getDay()];

    const day = this.settings.businessHours.find(item => item.key === dayKey);
    if (!day?.enabled) return null;

    const start = this.clockToMinutes(day.open);
    const end = this.clockToMinutes(day.close);

    if (start === null || end === null || end <= start) return null;
    return { start, end };
  }

  saveThroughApi(
    next: AdminSettings,
    done: (result: SettingsSaveResult) => void
  ): boolean {
    if (!this.api) return false;

    const validation = this.validate(next);
    if (!validation.success) {
      done(validation);
      return true;
    }

    const normalized = this.normalizeSettings(next);
    this.api.saveSettings(normalized).subscribe({
      next: response => {
        if (response.item) {
          const changed = JSON.stringify(this.settings) !== JSON.stringify(response.item);
          this.settings = this.normalizeSettings(response.item);
          this.api!.settingsSnapshot = this.clone(this.settings);

          if (changed) {
            this.notificationService.add({
              type: 'system',
              title: 'Settings updated',
              message: 'Business, booking, hours or notification settings were updated.',
              icon: 'bi-gear',
              url: '/admin/settings'
            });
          }
        }
        done({ success: response.success, message: response.message });
      },
      error: error => done({ success: false, message: this.apiError(error, 'Could not save settings.') })
    });

    return true;
  }

  resetThroughApi(done: (result: SettingsSaveResult) => void): boolean {
    if (!this.api) return false;

    this.api.resetSettings().subscribe({
      next: response => {
        if (response.item) {
          this.settings = this.normalizeSettings(response.item);
          this.api!.settingsSnapshot = this.clone(this.settings);
          this.notificationService.add({
            type: 'system',
            title: 'Settings reset',
            message: 'Admin settings were restored to their default configuration.',
            icon: 'bi-arrow-counterclockwise',
            url: '/admin/settings'
          });
        }
        done({ success: response.success, message: response.message });
      },
      error: error => done({ success: false, message: this.apiError(error, 'Could not reset settings.') })
    });

    return true;
  }

  save(next: AdminSettings): SettingsSaveResult {
    const validation = this.validate(next);
    if (!validation.success) return validation;

    const normalized: AdminSettings = {
      ...next,
      businessName: next.businessName.trim(),
      businessPhone: next.businessPhone.trim(),
      whatsappNumber: next.whatsappNumber.trim(),
      email: next.email.trim(),
      address: next.address.trim(),
      city: next.city.trim(),
      brandSubtitle: next.brandSubtitle.trim(),
      heroEyebrow: next.heroEyebrow.trim(),
      heroHeadline: next.heroHeadline.trim(),
      heroTagline: next.heroTagline.trim(),
      bookingInterval: Number(next.bookingInterval),
      maxAdvanceDays: Number(next.maxAdvanceDays),
      cancellationHours: Number(next.cancellationHours),
      lateArrivalMinutes: Number(next.lateArrivalMinutes),
      reminderHoursBefore: Number(next.reminderHoursBefore),
      businessHours: next.businessHours.map(day => ({
        ...day,
        open: day.open,
        close: day.close
      }))
    };

    const changed = JSON.stringify(this.settings) !== JSON.stringify(normalized);

    if (!this.api && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(normalized));
      } catch {
        return { success: false, message: 'Could not save settings in this browser.' };
      }
    }

    this.settings = normalized;

    if (changed) {
      this.notificationService.add({
        type: 'system',
        title: 'Settings updated',
        message: 'Business, booking, hours or notification settings were updated.',
        icon: 'bi-gear',
        url: '/admin/settings'
      });
    }

    return { success: true, message: 'Settings saved successfully.' };
  }

  reset(): SettingsSaveResult {
    const next = this.clone(DEFAULT_SETTINGS);

    if (!this.api && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(next));
      } catch {
        return { success: false, message: 'Could not reset settings in this browser.' };
      }
    }

    this.settings = next;

    this.notificationService.add({
      type: 'system',
      title: 'Settings reset',
      message: 'Admin settings were restored to their default configuration.',
      icon: 'bi-arrow-counterclockwise',
      url: '/admin/settings'
    });

    return { success: true, message: 'Settings reset to defaults.' };
  }

  private validate(settings: AdminSettings): SettingsSaveResult {
    if (!settings.businessName.trim()) {
      return { success: false, message: 'Business name is required.' };
    }

    if (settings.businessName.trim().length > 160) {
      return { success: false, message: 'Business name must be 160 characters or fewer.' };
    }

    if (!this.validPakistanPhone(settings.businessPhone)) {
      return { success: false, message: 'Enter a valid Pakistan business phone number.' };
    }

    if (!this.validPakistanPhone(settings.whatsappNumber)) {
      return { success: false, message: 'Enter a valid Pakistan WhatsApp number.' };
    }

    if (
      settings.email
      && (settings.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email))
    ) {
      return { success: false, message: 'Enter a valid email address.' };
    }

    if (settings.address.trim().length > 500) {
      return { success: false, message: 'Address must be 500 characters or fewer.' };
    }

    if (settings.city.trim().length > 120) {
      return { success: false, message: 'City must be 120 characters or fewer.' };
    }

    if (settings.currency.trim().length !== 3) {
      return { success: false, message: 'Currency must use a 3-letter code.' };
    }

    if (!settings.timezone.trim()) {
      return { success: false, message: 'Select a valid timezone.' };
    }

    if (settings.brandSubtitle.length > 60) {
      return { success: false, message: 'Header subtitle must be 60 characters or fewer.' };
    }

    if (settings.heroEyebrow.length > 60) {
      return { success: false, message: 'Hero eyebrow text must be 60 characters or fewer.' };
    }

    if (settings.heroHeadline.length > 90) {
      return { success: false, message: 'Hero headline must be 90 characters or fewer.' };
    }

    if (settings.heroTagline.length > 140) {
      return { success: false, message: 'Hero tagline must be 140 characters or fewer.' };
    }

    if (
      !Number.isInteger(Number(settings.bookingInterval))
      || Number(settings.bookingInterval) < 5
      || Number(settings.bookingInterval) > 240
    ) {
      return { success: false, message: 'Booking interval must be a whole number from 5 to 240 minutes.' };
    }

    if (
      !Number.isInteger(Number(settings.maxAdvanceDays))
      || Number(settings.maxAdvanceDays) < 1
      || Number(settings.maxAdvanceDays) > 365
    ) {
      return { success: false, message: 'Advance booking window must be a whole number from 1 to 365 days.' };
    }

    if (
      !Number.isInteger(Number(settings.cancellationHours))
      || Number(settings.cancellationHours) < 0
      || Number(settings.cancellationHours) > 168
    ) {
      return { success: false, message: 'Cancellation notice must be a whole number from 0 to 168 hours.' };
    }

    if (
      !Number.isInteger(Number(settings.lateArrivalMinutes))
      || Number(settings.lateArrivalMinutes) < 0
      || Number(settings.lateArrivalMinutes) > 240
    ) {
      return { success: false, message: 'Late arrival grace must be a whole number from 0 to 240 minutes.' };
    }

    if (
      settings.sendAppointmentReminder
      && (!Number.isInteger(Number(settings.reminderHoursBefore))
        || Number(settings.reminderHoursBefore) < 1
        || Number(settings.reminderHoursBefore) > 72)
    ) {
      return { success: false, message: 'Reminder time must be a whole number from 1 to 72 hours.' };
    }

    const validDayKeys = new Set([
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    ]);
    const hourKeys = settings.businessHours.map(item => String(item.key || '').toLowerCase());

    if (
      settings.businessHours.length !== 7
      || hourKeys.some(key => !validDayKeys.has(key))
      || new Set(hourKeys).size !== 7
    ) {
      return { success: false, message: 'Business hours must contain each weekday exactly once.' };
    }

    for (const day of settings.businessHours.filter(item => item.enabled)) {
      if (!day.open || !day.close || day.close <= day.open) {
        return {
          success: false,
          message: day.label + ' closing time must be later than opening time.'
        };
      }
    }

    return { success: true, message: '' };
  }

  private bookingDateTime(dateKey: string, time: string): Date | null {
    const dateMatch = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = String(time || '').match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);

    if (!dateMatch || !timeMatch) return null;

    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const period = timeMatch[3].toUpperCase();

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    return new Date(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      hour,
      minute,
      0,
      0
    );
  }

  private clockToMinutes(value: string): number | null {
    const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private validPakistanPhone(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    return /^(?:92)?3\d{9}$/.test(digits);
  }

  private normalizeSettings(next: AdminSettings): AdminSettings {
    const storedHours = Array.isArray(next.businessHours) ? next.businessHours : [];

    return {
      ...this.clone(DEFAULT_SETTINGS),
      ...next,
      businessName: String(next.businessName || '').trim(),
      businessPhone: String(next.businessPhone || '').trim(),
      whatsappNumber: String(next.whatsappNumber || '').trim(),
      email: String(next.email || '').trim(),
      address: String(next.address || '').trim(),
      city: String(next.city || '').trim(),
      currency: String(next.currency || 'PKR').trim(),
      timezone: String(next.timezone || 'Asia/Karachi').trim(),
      brandSubtitle: String(next.brandSubtitle || '').trim(),
      heroEyebrow: String(next.heroEyebrow || '').trim(),
      heroHeadline: String(next.heroHeadline || '').trim(),
      heroTagline: String(next.heroTagline || '').trim(),
      bookingInterval: Number(next.bookingInterval),
      maxAdvanceDays: Number(next.maxAdvanceDays),
      cancellationHours: Number(next.cancellationHours),
      lateArrivalMinutes: Number(next.lateArrivalMinutes),
      reminderHoursBefore: Number(next.reminderHoursBefore),
      businessHours: DEFAULT_HOURS.map((defaultDay, index) => {
        const savedDay = storedHours.find(day => day?.key === defaultDay.key)
          || storedHours.find(day => day?.label?.toLowerCase() === defaultDay.label.toLowerCase())
          || (storedHours.every(day => !day?.key && !day?.label) ? storedHours[index] : undefined);

        return {
          ...defaultDay,
          ...(savedDay || {}),
          key: defaultDay.key,
          label: defaultDay.label
        };
      })
    };
  }

  private apiError(error: unknown, fallback: string): string {
    return (error as any)?.error?.message || fallback;
  }

  private loadSettings(): AdminSettings {
    if (typeof window === 'undefined') return this.clone(DEFAULT_SETTINGS);

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return this.clone(DEFAULT_SETTINGS);

      const parsed = JSON.parse(raw) as AdminSettings;
      return this.normalizeSettings(parsed);
    } catch {
      return this.clone(DEFAULT_SETTINGS);
    }
  }

  private clone(settings: AdminSettings): AdminSettings {
    return {
      ...settings,
      businessHours: settings.businessHours.map(day => ({ ...day }))
    };
  }
}
