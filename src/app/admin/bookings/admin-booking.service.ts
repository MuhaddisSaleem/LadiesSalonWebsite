import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { AdminBarberService } from '../barbers/admin-barber.service';
import { AdminServiceService } from '../services/admin-service.service';
import { AdminSettingsService } from '../settings/admin-settings.service';
import { NotificationService } from '../notifications/notification.service';
import { BookingApiService, BookingBusySlot } from '../../core/booking-api.service';
import { AuthService } from '../../core/auth.service';

export type BookingStatus = 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';

export interface AdminBooking {
  id: number;
  code: string;
  customerName: string;
  phone: string;
  service: string;
  serviceNames?: string[];
  duration: number;
  barber: string;
  date: string;
  time: string;
  amount: number;
  status: BookingStatus;
  source: 'Online' | 'Admin' | 'Walk-in';
  notes?: string;
  groupSize?: number;
  serviceLocation?: 'Salon' | 'Home';
  serviceAddress?: string;
  specialService?: string;
  specialServiceAmount?: number;
}

export interface BookingMutationResult {
  success: boolean;
  message: string;
}

export interface WalkInBarberOption {
  name: string;
  startTime: string;
  waitMinutes: number;
  availableNow: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminBookingService {
  private readonly bookingsChangedSubject = new Subject<void>();
  readonly changes$ = this.bookingsChangedSubject.asObservable();

  constructor(
    private readonly barberService: AdminBarberService,
    private readonly serviceService: AdminServiceService,
    private readonly settingsService: AdminSettingsService,
    private readonly notificationService: NotificationService,
    private readonly api?: BookingApiService,
    private readonly auth?: AuthService
  ) {
    if (this.api) {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(this.storageKey);
        window.localStorage.removeItem(this.demoCleanupKey);
      }

      if (this.auth) {
        this.auth.currentUser$.subscribe(() => this.refreshFromApi());
      } else {
        this.refreshFromApi();
      }
    } else {
      this.bookings = this.loadBookings();
    }
  }

  salonNow(): Date {
    return this.settingsService.salonNow();
  }

  get barbers(): string[] {
    return this.barberService.active.map(barber => barber.name);
  }

  get services() {
    return this.serviceService.active.map(service => ({
      name: service.name,
      duration: service.duration,
      amount: this.serviceService.effectivePrice(service)
    }));
  }

  availableBarbersForService(service: string, dateKey: string): string[] {
    const services = this.serviceNames(service);

    return this.barberService.active
      .filter(barber =>
        (!dateKey || this.barberService.isAvailableOnDate(barber.id, dateKey))
        && this.barberService.supportsServices(barber.id, services)
      )
      .map(barber => barber.name);
  }

  availableBarbersForWalkIn(
    service: string,
    dateKey: string,
    time: string,
    duration: number,
    preferredWaitMinutes = 10,
    selectedNames?: string[]
  ): WalkInBarberOption[] {
    const startMinutes = this.timeToMinutes(time);
    if (!Number.isFinite(startMinutes)) return [];

    const date = new Date(dateKey + 'T12:00:00');
    const salonHours = this.settingsService.hoursForDate(date);
    if (!salonHours) return [];

    const latestStart = salonHours.end - duration;
    if (startMinutes > latestStart) return [];

    const services = selectedNames ?? this.serviceNames(service);
    const eligible = this.barberService.active.filter(barber =>
      this.barberService.isAvailableOnDate(barber.id, dateKey)
      && this.barberService.supportsServices(barber.id, services)
    );

    const options: Array<WalkInBarberOption & { rating: number; id: number }> = [];

    for (const barber of eligible) {
      const maxWait = Math.max(0, latestStart - startMinutes);

      for (let waitMinutes = 0; waitMinutes <= maxWait; waitMinutes++) {
        const candidateTime = this.minutesToTime(startMinutes + waitMinutes);
        const scheduleValidation = this.validateSchedule(dateKey, candidateTime, duration, true);

        if (
          scheduleValidation.success
          && this.barberService.isWorkingAt(barber.id, candidateTime, duration)
          && !this.hasConflict(barber.name, dateKey, candidateTime, duration)
        ) {
          options.push({
            name: barber.name,
            startTime: candidateTime,
            waitMinutes,
            availableNow: waitMinutes === 0,
            rating: Number(barber.rating) || 0,
            id: barber.id
          });
          break;
        }
      }
    }

    const availableNow = options.filter(option => option.availableNow);
    if (availableNow.length) {
      return availableNow
        .sort((a, b) => b.rating - a.rating || a.id - b.id)
        .map(({ rating, id, ...option }) => option);
    }

    const shortWait = options.filter(option =>
      option.waitMinutes > 0 && option.waitMinutes <= preferredWaitMinutes
    );

    const visible = shortWait.length
      ? shortWait
      : options.filter(option => option.waitMinutes > 0);

    return visible
      .sort((a, b) =>
        a.waitMinutes - b.waitMinutes
        || b.rating - a.rating
        || a.id - b.id
      )
      .map(({ rating, id, ...option }) => option);
  }

  availableBarbersForBooking(booking: AdminBooking, dateKey: string): string[] {
    const services = this.bookingServiceNames(booking);

    return this.barberService.active
      .filter(barber =>
        (!dateKey || this.barberService.isAvailableOnDate(barber.id, dateKey))
        && this.barberService.supportsServices(barber.id, services)
      )
      .sort((a, b) => b.rating - a.rating || a.id - b.id)
      .map(barber => barber.name);
  }

  private readonly storageKey = 'royal-barbers.admin-bookings.v1';
  private readonly demoCleanupKey = 'royal-barbers.admin-bookings.demo-cleaned.v1';
  private bookings: AdminBooking[] = [];

  refreshFromStorage(): void {
    if (this.api) {
      this.refreshFromApi();
      return;
    }
    this.bookings = this.loadBookings();
    this.bookingsChangedSubject.next();
  }

  refreshFromApi(): void {
    if (!this.api) return;

    if (this.auth?.isAuthenticated()) {
      this.api.getAll().subscribe({
        next: bookings => {
          this.bookings = Array.isArray(bookings) ? bookings.map(item => this.normalizeBooking(item)) : [];
          this.bookingsChangedSubject.next();
        },
        error: error => this.notifyApiError('Could not load bookings from the API.', error)
      });
      return;
    }

    this.api.getBusySlots().subscribe({
      next: slots => {
        this.bookings = Array.isArray(slots) ? slots.map(item => this.busySlotBooking(item)) : [];
        this.bookingsChangedSubject.next();
      },
      error: error => this.notifyApiError('Could not load booking availability from the API.', error)
    });
  }

  get apiEnabled(): boolean {
    return !!this.api;
  }

  createOnlineBookingsThroughApi(
    bookings: Array<Omit<AdminBooking, 'id' | 'code' | 'status' | 'source'>>,
    onSuccess: (result: BookingMutationResult) => void,
    onError: (message: string) => void
  ): boolean {
    if (!this.api) return false;

    this.api.createOnline(bookings).subscribe({
      next: response => this.reloadAfterMutation(response, onSuccess),
      error: error => onError(this.apiErrorMessage(error, 'Could not save the booking. Please try again.'))
    });

    return true;
  }

  createWalkInThroughApi(
    booking: Omit<AdminBooking, 'id' | 'code' | 'status' | 'source'>,
    onSuccess: (result: BookingMutationResult) => void,
    onError: (message: string) => void
  ): boolean {
    if (!this.api) return false;

    this.api.createWalkIn(booking).subscribe({
      next: response => this.reloadAfterMutation(response, onSuccess),
      error: error => onError(this.apiErrorMessage(error, 'Could not save the walk-in booking. Please try again.'))
    });

    return true;
  }

  private reloadAfterMutation(
    response: BookingMutationResult,
    onSuccess: (result: BookingMutationResult) => void
  ): void {
    // The POST is committed. A failed refresh must never invite a duplicate retry.
    onSuccess(response);
    if (!this.api) return;

    if (this.auth?.isAuthenticated()) {
      this.api.getAll().subscribe({
        next: bookings => {
          this.bookings = Array.isArray(bookings) ? bookings.map(item => this.normalizeBooking(item)) : [];
          this.bookingsChangedSubject.next();
        },
        error: error => this.notifyApiError('Booking saved. Could not refresh the list; reload it before making another booking.', error)
      });
      return;
    }

    this.api.getBusySlots().subscribe({
      next: slots => {
        this.bookings = Array.isArray(slots) ? slots.map(item => this.busySlotBooking(item)) : [];
        this.bookingsChangedSubject.next();
      },
      error: error => this.notifyApiError('Booking saved. Could not refresh availability; reload before making another booking.', error)
    });
  }

  get all(): AdminBooking[] {
    return this.bookings;
  }

  getById(id: number): AdminBooking | undefined {
    return this.bookings.find(item => item.id === id);
  }

  isBarberSlotAvailable(
    barberName: string,
    dateKey: string,
    time: string,
    duration: number,
    ignoreId?: number
  ): boolean {
    const barberId = this.barberIdByName(barberName);
    if (!barberId) return false;
    if (!this.barberService.isAvailableOnDate(barberId, dateKey)) return false;
    if (!this.barberService.isWorkingAt(barberId, time, duration)) return false;

    return !this.hasConflict(barberName, dateKey, time, duration, ignoreId);
  }


  updateStatus(id: number, status: BookingStatus): BookingMutationResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, message: 'Booking not found.' };

    if (
      (status === 'Confirmed' || status === 'Completed')
      && booking.serviceLocation === 'Home'
      && booking.specialService?.trim()
      && !(Number(booking.specialServiceAmount) > 0)
    ) {
      return {
        success: false,
        message: 'Set the custom home-service price before confirming this booking.'
      };
    }

    if (booking.status === 'Cancelled' && status !== 'Cancelled') {
      return { success: false, message: 'Cancelled bookings cannot be reopened.' };
    }

    if (booking.status === 'Completed' && status !== 'Completed') {
      return { success: false, message: 'Completed bookings cannot be moved back to another status.' };
    }

    const previousStatus = booking.status;
    booking.status = status;

    if (!this.persist()) {
      booking.status = previousStatus;
      return { success: false, message: 'Could not save the booking status. Please try again.' };
    }

    this.api?.updateStatus(id, status).subscribe({
      next: response => {
        if (response.booking) Object.assign(booking, this.normalizeBooking(response.booking));
      },
      error: error => {
        booking.status = previousStatus;
        this.notifyApiError('Could not update the booking status.', error);
      }
    });

    if (previousStatus !== status) {
      this.notificationService.add({
        type: status === 'Cancelled' ? 'cancelled' : 'booking',
        title: status === 'Cancelled' ? 'Booking cancelled' : 'Booking status updated',
        message: booking.code + ' for ' + booking.customerName + ' is now ' + status.toLowerCase() + '.',
        icon: status === 'Cancelled' ? 'bi-x-circle' : (status === 'Completed' ? 'bi-check2-circle' : 'bi-calendar2-check'),
        url: '/admin/bookings?booking=' + booking.id
      });
    }

    return { success: true, message: 'Booking ' + booking.code + ' marked ' + status.toLowerCase() + '.' };
  }

  assignBarber(id: number, barber: string): BookingMutationResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, message: 'Booking not found.' };
    if (booking.status === 'Cancelled' || booking.status === 'Completed') {
      return { success: false, message: 'This booking can no longer be reassigned.' };
    }
    const barberId = this.barberIdByName(barber);
    if (!barberId) return { success: false, message: 'Selected barber is not active.' };

    if (!this.barberService.isAvailableOnDate(barberId, booking.date)) {
      return { success: false, message: barber + ' is not available on this booking date.' };
    }

    if (!this.barberService.supportsServices(barberId, this.bookingServiceNames(booking))) {
      return { success: false, message: barber + ' does not provide all services in this booking.' };
    }

    if (!this.barberService.isWorkingAt(barberId, booking.time, booking.duration)) {
      return { success: false, message: barber + ' is outside their configured working hours at this time.' };
    }

    if (this.hasConflict(barber, booking.date, booking.time, booking.duration, id)) {
      return { success: false, message: barber + ' already has an overlapping appointment at this time.' };
    }
    const previousBarber = booking.barber;
    booking.barber = barber;

    if (!this.persist()) {
      booking.barber = previousBarber;
      return { success: false, message: 'Could not save the barber assignment. Please try again.' };
    }

    this.api?.assignBarber(id, barber).subscribe({
      next: response => {
        if (response.booking) Object.assign(booking, this.normalizeBooking(response.booking));
      },
      error: error => {
        booking.barber = previousBarber;
        this.notifyApiError('Could not save the barber assignment.', error);
      }
    });

    if (previousBarber !== barber) {
      this.notificationService.add({
        type: 'booking',
        title: 'Barber reassigned',
        message: booking.code + ' moved from ' + previousBarber + ' to ' + barber + '.',
        icon: 'bi-person-gear',
        url: '/admin/bookings?booking=' + booking.id
      });
    }

    return { success: true, message: barber + ' assigned successfully.' };
  }

  reschedule(id: number, date: string, time: string): BookingMutationResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, message: 'Booking not found.' };
    if (booking.status === 'Cancelled' || booking.status === 'Completed') {
      return { success: false, message: 'This booking can no longer be rescheduled.' };
    }
    if (!date || !time) return { success: false, message: 'Please choose both a date and time.' };

    const scheduleValidation = this.validateSchedule(date, time, booking.duration);
    if (!scheduleValidation.success) return scheduleValidation;

    const barberId = this.barberIdByName(booking.barber);
    if (!barberId || !this.barberService.isAvailableOnDate(barberId, date)) {
      return { success: false, message: booking.barber + ' is not available on the selected date.' };
    }

    if (!this.barberService.supportsServices(barberId, this.bookingServiceNames(booking))) {
      return { success: false, message: booking.barber + ' no longer provides all services in this booking.' };
    }

    if (!this.barberService.isWorkingAt(barberId, time, booking.duration)) {
      return { success: false, message: booking.barber + ' is outside their configured working hours at this time.' };
    }

    if (this.hasConflict(booking.barber, date, time, booking.duration, id)) {
      return { success: false, message: booking.barber + ' already has an overlapping appointment at this time.' };
    }
    const previousDate = booking.date;
    const previousTime = booking.time;
    booking.date = date;
    booking.time = time;

    if (!this.persist()) {
      booking.date = previousDate;
      booking.time = previousTime;
      return { success: false, message: 'Could not save the new appointment schedule. Please try again.' };
    }

    this.api?.reschedule(id, date, time).subscribe({
      next: response => {
        if (response.booking) Object.assign(booking, this.normalizeBooking(response.booking));
      },
      error: error => {
        booking.date = previousDate;
        booking.time = previousTime;
        this.notifyApiError('Could not save the new appointment schedule.', error);
      }
    });

    if (previousDate !== date || previousTime !== time) {
      this.notificationService.add({
        type: 'rescheduled',
        title: 'Booking rescheduled',
        message: booking.code + ' for ' + booking.customerName + ' moved to ' + date + ' at ' + time + '.',
        icon: 'bi-calendar2-week',
        url: '/admin/bookings?booking=' + booking.id
      });
    }

    return { success: true, message: 'Appointment rescheduled successfully.' };
  }

  updateSpecialServiceAmount(id: number, amount: number): BookingMutationResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, message: 'Booking not found.' };

    if (booking.status === 'Completed' || booking.status === 'Cancelled') {
      return { success: false, message: 'Closed bookings cannot be repriced.' };
    }

    if (booking.serviceLocation !== 'Home' || !booking.specialService?.trim()) {
      return { success: false, message: 'This booking does not contain a custom home-service request.' };
    }

    const nextAmount = Number(amount);
    if (!Number.isInteger(nextAmount) || nextAmount <= 0) {
      return { success: false, message: 'Enter a whole-rupee custom service amount greater than 0.' };
    }

    const previousSpecialAmount = Number(booking.specialServiceAmount) || 0;
    const previousTotal = booking.amount;

    booking.specialServiceAmount = Math.round(nextAmount);
    booking.amount = Math.max(0, previousTotal - previousSpecialAmount) + booking.specialServiceAmount;

    if (!this.persist()) {
      booking.specialServiceAmount = previousSpecialAmount;
      booking.amount = previousTotal;
      return { success: false, message: 'Could not save the custom service price.' };
    }

    this.api?.updateSpecialServicePrice(id, booking.specialServiceAmount).subscribe({
      next: response => {
        if (response.booking) Object.assign(booking, this.normalizeBooking(response.booking));
      },
      error: error => {
        booking.specialServiceAmount = previousSpecialAmount;
        booking.amount = previousTotal;
        this.notifyApiError('Could not save the custom service price.', error);
      }
    });

    this.notificationService.add({
      type: 'booking',
      title: 'Custom home-service price set',
      message: booking.code + ' custom service was priced at Rs. ' + booking.specialServiceAmount.toLocaleString('en-US') + '.',
      icon: 'bi-cash-coin',
      url: '/admin/bookings?booking=' + booking.id
    });

    return { success: true, message: 'Custom home-service price updated.' };
  }

  cancel(id: number): BookingMutationResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, message: 'Booking not found.' };
    if (booking.status === 'Completed') {
      return { success: false, message: 'Completed bookings cannot be cancelled.' };
    }
    return this.updateStatus(id, 'Cancelled');
  }

  customerCancel(id: number): BookingMutationResult {
    const booking = this.getById(id);
    if (!booking) return { success: false, message: 'Booking not found.' };

    if (booking.status === 'Cancelled' || booking.status === 'Completed') {
      return { success: false, message: 'This booking can no longer be cancelled by the customer.' };
    }

    if (!this.settingsService.canCustomerCancel(booking.date, booking.time)) {
      return {
        success: false,
        message: 'The cancellation window has closed. Please contact the salon for assistance.'
      };
    }

    return this.updateStatus(id, 'Cancelled');
  }

  isPastLateArrivalGrace(booking: AdminBooking): boolean {
    return (booking.status === 'Pending' || booking.status === 'Confirmed')
      && this.settingsService.isPastLateArrivalGrace(booking.date, booking.time);
  }

  addOnlineBookings(
    inputs: Array<Omit<AdminBooking, 'id' | 'code' | 'status' | 'source'>>
  ): BookingMutationResult {
    if (!inputs.length) {
      return { success: false, message: 'No booking details were provided.' };
    }

    const staged: Array<Omit<AdminBooking, 'id' | 'code' | 'status' | 'source'>> = [];

    for (const input of inputs) {
      const scheduleValidation = this.validateSchedule(input.date, input.time, input.duration);
      if (!scheduleValidation.success) return scheduleValidation;

      const barberId = this.barberIdByName(input.barber);
      if (!barberId || !this.barberService.isAvailableOnDate(barberId, input.date)) {
        return { success: false, message: input.barber + ' is not available on this date.' };
      }

      if (!this.barberService.supportsServices(barberId, this.bookingServiceNames(input))) {
        return { success: false, message: input.barber + ' does not provide all selected services.' };
      }

      if (!this.barberService.isWorkingAt(barberId, input.time, input.duration)) {
        return { success: false, message: input.barber + ' is outside their configured working hours at this time.' };
      }

      if (
        this.hasConflict(input.barber, input.date, input.time, input.duration)
        || staged.some(item => this.bookingsOverlap(item, input))
      ) {
        return {
          success: false,
          message: input.barber + ' already has an overlapping appointment at this time.'
        };
      }

      staged.push(input);
    }

    let nextId = Math.max(0, ...this.bookings.map(item => item.id)) + 1;
    const created: AdminBooking[] = staged.map(input => {
      const id = nextId++;
      return {
        ...input,
        id,
        code: this.bookingCode(id),
        status: input.serviceLocation === 'Home' && !!input.specialService?.trim()
          ? 'Pending'
          : (this.settingsService.current.autoConfirmBookings ? 'Confirmed' : 'Pending'),
        source: 'Online'
      };
    });

    const previousBookings = this.bookings;
    this.bookings = [...created.reverse(), ...this.bookings];

    if (!this.persist()) {
      this.bookings = previousBookings;
      return { success: false, message: 'Could not save the booking. Please try again.' };
    }

    if (this.settingsService.current.notifyOwnerOnNewBooking) {
      const first = created[0];
      this.notificationService.add({
        type: 'booking',
        title: created.length > 1 ? 'New group booking' : 'New online booking',
        message: created.length > 1
          ? first.customerName + ' booked ' + created.length + ' appointments for ' + first.date + '.'
          : first.customerName + ' booked ' + first.service
            + (first.serviceLocation === 'Home' ? ' as a home service' : '')
            + ' with ' + first.barber + ' for ' + first.date + ' at ' + first.time + '.',
        icon: 'bi-calendar2-plus',
        url: '/admin/bookings?booking=' + first.id
      });
    }

    return {
      success: true,
      message: created.length > 1
        ? created.length + ' appointments booked successfully.'
        : 'Booking created successfully.'
    };
  }

  addWalkInBooking(input: Omit<AdminBooking, 'id' | 'code' | 'status' | 'source'>): BookingMutationResult {
    const now = this.settingsService.salonNow();
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');

    if (input.date !== todayKey) {
      return { success: false, message: 'Walk-in bookings can only be created for today.' };
    }

    const scheduleValidation = this.validateSchedule(input.date, input.time, input.duration, true);
    if (!scheduleValidation.success) return scheduleValidation;

    const barberId = this.barberIdByName(input.barber);
    if (!barberId || !this.barberService.isAvailableOnDate(barberId, input.date)) {
      return { success: false, message: input.barber + ' is not available today.' };
    }

    if (!this.barberService.supportsServices(barberId, this.bookingServiceNames(input))) {
      return { success: false, message: input.barber + ' does not provide the selected service.' };
    }

    if (!this.barberService.isWorkingAt(barberId, input.time, input.duration)) {
      return { success: false, message: input.barber + ' is outside their configured working hours at this time.' };
    }

    if (this.hasConflict(input.barber, input.date, input.time, input.duration)) {
      return { success: false, message: input.barber + ' already has an overlapping appointment at this time.' };
    }

    const nextId = Math.max(0, ...this.bookings.map(item => item.id)) + 1;
    const previousBookings = this.bookings;
    this.bookings = [
      {
        ...input,
        id: nextId,
        code: this.bookingCode(nextId),
        status: 'Confirmed',
        source: 'Walk-in',
        serviceLocation: 'Salon'
      },
      ...this.bookings
    ];

    if (!this.persist()) {
      this.bookings = previousBookings;
      return { success: false, message: 'Could not save the walk-in booking. Please try again.' };
    }

    const created = this.bookings[0];
    this.notificationService.add({
      type: 'booking',
      title: 'Walk-in booking created',
      message: created.customerName + ' booked ' + created.service + ' with ' + created.barber + ' for ' + created.time + '.',
      icon: 'bi-person-walking',
      url: '/admin/bookings?booking=' + created.id
    });

    return {
      success: true,
      message: 'Walk-in booked with ' + created.barber + ' at ' + created.time + '.'
    };
  }

  addBooking(input: Omit<AdminBooking, 'id' | 'code' | 'status' | 'source'>): BookingMutationResult {
    const scheduleValidation = this.validateSchedule(input.date, input.time, input.duration);
    if (!scheduleValidation.success) return scheduleValidation;

    const barberId = this.barberIdByName(input.barber);
    if (!barberId || !this.barberService.isAvailableOnDate(barberId, input.date)) {
      return { success: false, message: input.barber + ' is not available on this date.' };
    }

    if (!this.barberService.supportsServices(barberId, this.bookingServiceNames(input))) {
      return { success: false, message: input.barber + ' does not provide this service.' };
    }

    if (!this.barberService.isWorkingAt(barberId, input.time, input.duration)) {
      return { success: false, message: input.barber + ' is outside their configured working hours at this time.' };
    }

    if (this.hasConflict(input.barber, input.date, input.time, input.duration)) {
      return { success: false, message: input.barber + ' already has an overlapping appointment at this time.' };
    }

    const nextId = Math.max(0, ...this.bookings.map(item => item.id)) + 1;
    const previousBookings = this.bookings;
    this.bookings = [
      {
        ...input,
        id: nextId,
        code: this.bookingCode(nextId),
        status: 'Confirmed',
        source: 'Admin'
      },
      ...this.bookings
    ];

    if (!this.persist()) {
      this.bookings = previousBookings;
      return { success: false, message: 'Could not save the booking. Please try again.' };
    }

    this.api?.createAdmin(input).subscribe({
      next: () => this.refreshFromApi(),
      error: error => {
        this.bookings = previousBookings;
        this.notifyApiError('Could not save the admin booking to SQL Server.', error);
      }
    });

    const created = this.bookings[0];
    this.notificationService.add({
      type: 'booking',
      title: 'Admin booking created',
      message: created.customerName + ' booked ' + created.service + ' with ' + created.barber + ' for ' + created.date + ' at ' + created.time + '.',
      icon: 'bi-calendar2-plus',
      url: '/admin/bookings?booking=' + created.id
    });

    return { success: true, message: 'Booking created successfully.' };
  }

  private validateSchedule(dateKey: string, time: string, duration: number, allowWalkInSameDay = false): BookingMutationResult {
    const dateMatch = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      return { success: false, message: 'Select a valid appointment date.' };
    }

    const date = new Date(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      12,
      0,
      0,
      0
    );

    if (date.getFullYear() !== Number(dateMatch[1])
      || date.getMonth() !== Number(dateMatch[2]) - 1
      || date.getDate() !== Number(dateMatch[3])) {
      return { success: false, message: 'Select a valid appointment date.' };
    }

    const today = this.settingsService.salonNow();
    const walkInTodayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    if (allowWalkInSameDay) {
      if (dateKey !== walkInTodayKey) {
        return { success: false, message: 'Walk-in bookings can only be created for today.' };
      }
    } else if (!this.settingsService.isBookingDateAllowed(date)) {
      return { success: false, message: 'This date is outside the current booking window or the salon is closed.' };
    }

    const hours = this.settingsService.hoursForDate(date);
    if (!hours) {
      return { success: false, message: 'The salon is closed on the selected date.' };
    }

    const start = this.timeToMinutes(time);
    const end = start + Number(duration);

    if (!Number.isFinite(start) || !Number.isFinite(end) || Number(duration) <= 0) {
      return { success: false, message: 'Select a valid appointment time and duration.' };
    }

    if (start < hours.start || end > hours.end) {
      return { success: false, message: 'This appointment falls outside the configured business hours.' };
    }

    const now = this.settingsService.salonNow();
    const todayKey = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');

    if (dateKey === todayKey) {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const isPast = allowWalkInSameDay ? start < nowMinutes : start <= nowMinutes;
      if (isPast) {
        return { success: false, message: 'The selected appointment time has already passed.' };
      }
    }

    return { success: true, message: '' };
  }

  private barberIdByName(name: string): number {
    return this.barberService.active.find(barber => barber.name === name)?.id || 0;
  }

  private bookingsOverlap(
    first: Pick<AdminBooking, 'barber' | 'date' | 'time' | 'duration'>,
    second: Pick<AdminBooking, 'barber' | 'date' | 'time' | 'duration'>
  ): boolean {
    if (first.barber !== second.barber || first.date !== second.date) return false;

    const firstStart = this.timeToMinutes(first.time);
    const firstEnd = firstStart + first.duration;
    const secondStart = this.timeToMinutes(second.time);
    const secondEnd = secondStart + second.duration;

    return firstStart < secondEnd && firstEnd > secondStart;
  }

  private hasConflict(barber: string, date: string, time: string, duration: number, ignoreId?: number): boolean {
    const start = this.timeToMinutes(time);
    const end = start + duration;
    return this.bookings.some(item => {
      if (item.id === ignoreId || item.status === 'Cancelled' || item.barber !== barber || item.date !== date) return false;
      const otherStart = this.timeToMinutes(item.time);
      const otherEnd = otherStart + item.duration;
      return start < otherEnd && end > otherStart;
    });
  }

  private loadBookings(): AdminBooking[] {
    if (typeof window === 'undefined') return [];

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        window.localStorage.setItem(this.demoCleanupKey, '1');
        return [];
      }

      const parsed = JSON.parse(raw) as AdminBooking[];
      if (!Array.isArray(parsed)) return [];

      const needsCleanup = window.localStorage.getItem(this.demoCleanupKey) !== '1';
      const demoCodes = new Set([
        'RB-2601','RB-2602','RB-2603','RB-2604','RB-2605','RB-2606',
        'RB-2607','RB-2608','RB-2609','RB-2610','RB-2611','RB-2612'
      ]);

      const cleaned: AdminBooking[] = parsed
        .filter(item =>
          item
          && Number.isFinite(Number(item.id))
          && (!needsCleanup || !demoCodes.has(String(item.code || '')))
        )
        .map((item): AdminBooking => ({
          ...item,
          id: Number(item.id),
          duration: Number(item.duration) || 0,
          amount: Number(item.amount) || 0,
          groupSize: Number(item.groupSize) || 1,
          status: this.isBookingStatus(item.status) ? item.status : 'Pending',
          source: item.source === 'Walk-in' ? 'Walk-in' : (item.source === 'Admin' ? 'Admin' : 'Online'),
          notes: item.notes || '',
          serviceLocation: item.serviceLocation === 'Home' ? 'Home' : 'Salon',
          serviceAddress: item.serviceAddress || '',
          specialService: item.specialService || '',
          specialServiceAmount: Number(item.specialServiceAmount) || 0
        }));

      if (needsCleanup) {
        window.localStorage.setItem(this.storageKey, JSON.stringify(cleaned));
        window.localStorage.setItem(this.demoCleanupKey, '1');
      }

      return cleaned;
    } catch {
      return [];
    }
  }

  private persist(): boolean {
    if (this.api) return true;
    if (typeof window === 'undefined') return true;

    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.bookings));
      this.bookingsChangedSubject.next();
      return true;
    } catch {
      return false;
    }
  }

  private busySlotBooking(item: BookingBusySlot): AdminBooking {
    return {
      id: Number(item.id),
      code: '',
      customerName: '',
      phone: '',
      service: '',
      duration: Number(item.duration) || 0,
      barber: item.barber,
      date: item.date,
      time: item.time,
      amount: 0,
      status: item.status,
      source: 'Online',
      notes: '',
      groupSize: 1,
      serviceLocation: 'Salon',
      serviceAddress: '',
      specialService: '',
      specialServiceAmount: 0
    };
  }

  private normalizeBooking(item: AdminBooking): AdminBooking {
    return {
      ...item,
      id: Number(item.id),
      duration: Number(item.duration) || 0,
      amount: Number(item.amount) || 0,
      groupSize: Number(item.groupSize) || 1,
      status: this.isBookingStatus(item.status) ? item.status : 'Pending',
      source: item.source === 'Walk-in' ? 'Walk-in' : (item.source === 'Admin' ? 'Admin' : 'Online'),
      notes: item.notes || '',
      serviceLocation: item.serviceLocation === 'Home' ? 'Home' : 'Salon',
      serviceAddress: item.serviceAddress || '',
      specialService: item.specialService || '',
      specialServiceAmount: Number(item.specialServiceAmount) || 0
    };
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    return (error as any)?.error?.message || fallback;
  }

  private notifyApiError(message: string, error: unknown): void {
    const apiMessage = (error as any)?.error?.message;
    this.notificationService.add({
      type: 'system',
      title: 'Database sync failed',
      message: apiMessage ? message + ' ' + apiMessage : message,
      icon: 'bi-cloud-slash',
      url: '/admin/bookings'
    });
  }

  private isBookingStatus(value: string): value is BookingStatus {
    return value === 'Pending'
      || value === 'Confirmed'
      || value === 'Completed'
      || value === 'Cancelled';
  }

  private bookingCode(id: number): string {
    const words = this.settingsService.current.businessName
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const prefix = words.length > 1
      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
      : (words[0]?.slice(0, 2).toUpperCase() || 'BK');

    return prefix + '-' + String(2600 + id);
  }

  private bookingServiceNames(
    booking: Pick<AdminBooking, 'service' | 'serviceNames' | 'serviceLocation' | 'specialService'>
  ): string[] {
    if (
      booking.serviceLocation === 'Home'
      && booking.specialService?.trim()
      && booking.service === 'Custom Home Service'
    ) {
      return [];
    }

    return booking.serviceNames ?? this.serviceNames(booking.service);
  }

  private serviceNames(service: string): string[] {
    const serialized = String(service || '').trim();
    if (!serialized) return [];

    const exactCatalogueService = this.services.find(
      item => item.name.trim().toLowerCase() === serialized.toLowerCase()
    );

    if (exactCatalogueService) {
      return [exactCatalogueService.name];
    }

    return serialized
      .split(',')
      .map(name => name.trim())
      .filter(Boolean);
  }

  private minutesToTime(totalMinutes: number): string {
    const safeMinutes = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    let hour = Math.floor(safeMinutes / 60);
    const minute = safeMinutes % 60;
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return hour + ':' + String(minute).padStart(2, '0') + ' ' + period;
  }

  private timeToMinutes(time: string): number {
    const match = time.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
    if (!match) return Number.NaN;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const period = match[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute > 59) return Number.NaN;
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
}
