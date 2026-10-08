import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AdminShellComponent } from '../shared/admin-shell.component';
import { AdminBooking, AdminBookingService, BookingStatus, WalkInBarberOption } from './admin-booking.service';
import { AdminSettingsService } from '../settings/admin-settings.service';

type BookingTab = 'all' | 'today' | 'upcoming' | 'completed' | 'cancelled';

@Component({
  selector: 'app-admin-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  templateUrl: './admin-bookings.component.html',
  styleUrl: './admin-bookings.component.scss'
})
export class AdminBookingsComponent implements OnInit, OnDestroy {
  private readonly subscriptions = new Subscription();
  private pendingBookingId: number | null = null;
  creatingBooking = false;
  activeTab: BookingTab = 'today';
  searchTerm = '';
  selectedBarber = 'All';
  selectedService = 'All';
  selectedDate = '';

  selectedBooking: AdminBooking | null = null;
  drawerOpen = false;
  createModalOpen = false;
  cancelDialogOpen = false;
  feedbackMessage = '';
  feedbackType: 'success' | 'error' = 'success';
  walkInServiceSearch = '';
  walkInServiceDropdownOpen = false;
  walkInServiceOverlayStyle: Record<string, string> = {};
  walkInSelectedServiceNames: string[] = [];
  walkInBarberOptions: WalkInBarberOption[] = [];
  private walkInServiceTriggerElement?: HTMLElement;

  editBarber = '';
  editDate = '';
  editTime = '';
  customServiceAmount = '';

  newBooking = {
    customerName: '',
    phone: '',
    service: '',
    barber: '',
    date: '',
    time: '',
    notes: ''
  };

  constructor(
    public readonly bookingService: AdminBookingService,
    private readonly route: ActivatedRoute,
    private readonly settingsService: AdminSettingsService
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.route.queryParamMap.subscribe(params => {
      const customer = params.get('customer');
      if (customer) {
        this.searchTerm = customer;
        this.activeTab = 'all';
      }
      const id = Number(params.get('booking'));
      this.pendingBookingId = Number.isSafeInteger(id) && id > 0 ? id : null;
      this.openPendingBooking();
    }));
    this.subscriptions.add(this.bookingService.changes$.subscribe(() => this.openPendingBooking()));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private openPendingBooking(): void {
    if (this.pendingBookingId === null) return;
    const booking = this.bookingService.getById(this.pendingBookingId);
    if (!booking) return;
    this.pendingBookingId = null;
    this.openBooking(booking);
  }

  get todayKey(): string {
    return this.toDateKey(this.settingsService.salonNow());
  }

  get minDate(): string {
    if (this.settingsService.current.allowSameDayBooking) return this.todayKey;

    const tomorrow = this.settingsService.salonNow();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.toDateKey(tomorrow);
  }

  get maxDate(): string {
    const date = this.settingsService.salonNow();
    date.setDate(date.getDate() + this.settingsService.maxAdvanceDays);
    return this.toDateKey(date);
  }

  get filterBarbers(): string[] {
    return Array.from(new Set([
      ...this.bookingService.barbers,
      ...this.bookingService.all.map(item => item.barber).filter(Boolean)
    ])).sort((a, b) => a.localeCompare(b));
  }

  get filterServices(): string[] {
    const historicalServices = this.bookingService.all.flatMap(item =>
      this.bookingServiceNames(item)
    );

    return Array.from(new Set([
      ...this.bookingService.services.map(item => item.name),
      ...historicalServices
    ])).sort((a, b) => a.localeCompare(b));
  }

  get createTimeSlots(): string[] {
    const service = this.selectedWalkInService;
    if (!service || !this.newBooking.barber) return [];

    const slots = this.slotsForDuration(service.duration, this.todayKey, true);

    return slots.filter(time =>
      this.bookingService.isBarberSlotAvailable(
        this.newBooking.barber,
        this.todayKey,
        time,
        service.duration
      )
    );
  }

  get editTimeSlots(): string[] {
    const duration = this.selectedBooking?.duration ?? 30;
    const slots = this.slotsForDuration(duration, this.editDate);

    if (!this.selectedBooking) return [];

    return slots.filter(time =>
      this.bookingService.isBarberSlotAvailable(
        this.selectedBooking!.barber,
        this.editDate,
        time,
        duration,
        this.selectedBooking?.id
      )
    );
  }

  get selectedWalkInServiceNames(): string[] {
    return this.walkInSelectedServiceNames;
  }

  get selectedWalkInServices() {
    const selected = new Set(this.selectedWalkInServiceNames);
    return this.bookingService.services.filter(service => selected.has(service.name));
  }

  get selectedWalkInService() {
    const services = this.selectedWalkInServices;
    if (!services.length) return undefined;

    return {
      name: services.map(service => service.name).join(', '),
      duration: services.reduce((total, service) => total + service.duration, 0),
      amount: services.reduce((total, service) => total + service.amount, 0)
    };
  }

  get filteredWalkInServices() {
    const term = this.walkInServiceSearch.trim().toLowerCase();
    if (!term) return this.bookingService.services;

    return this.bookingService.services.filter(service =>
      service.name.toLowerCase().includes(term)
    );
  }

  get walkInServiceButtonLabel(): string {
    const selected = this.selectedWalkInServiceNames;
    if (!selected.length) return 'Select services';
    if (selected.length === 1) return selected[0];
    return selected.length + ' services selected';
  }

  isWalkInServiceSelected(serviceName: string): boolean {
    return this.selectedWalkInServiceNames.includes(serviceName);
  }

  toggleWalkInServiceDropdown(event: Event): void {
    event.stopPropagation();
    this.walkInServiceTriggerElement = event.currentTarget as HTMLElement;
    this.walkInServiceDropdownOpen = !this.walkInServiceDropdownOpen;

    if (this.walkInServiceDropdownOpen) {
      this.positionWalkInServicePanel();
      return;
    }

    this.walkInServiceSearch = '';
    this.walkInServiceOverlayStyle = {};
  }

  toggleWalkInService(serviceName: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const selected = new Set(this.walkInSelectedServiceNames);

    if (selected.has(serviceName)) {
      selected.delete(serviceName);
    } else {
      selected.add(serviceName);
    }

    // Keep UI selection state independent from the serialized booking value.
    // Preserve the catalogue order so the displayed/posted service list is stable.
    this.walkInSelectedServiceNames = this.bookingService.services
      .filter(service => selected.has(service.name))
      .map(service => service.name);

    this.newBooking.service = this.walkInSelectedServiceNames.join(', ');
    this.onCreateServiceOrDateChange();
  }

  @HostListener('document:click')
  closeWalkInServiceDropdown(): void {
    if (!this.walkInServiceDropdownOpen) return;
    this.walkInServiceDropdownOpen = false;
    this.walkInServiceSearch = '';
    this.walkInServiceOverlayStyle = {};
  }

  @HostListener('window:resize')
  repositionWalkInServiceDropdown(): void {
    if (this.walkInServiceDropdownOpen) {
      this.positionWalkInServicePanel();
    }
  }

  positionWalkInServicePanel(): void {
    const trigger = this.walkInServiceTriggerElement;
    if (!trigger || !this.walkInServiceDropdownOpen) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 10;
    const gap = 6;
    const availableBelow = window.innerHeight - rect.bottom - viewportPadding;
    const availableAbove = rect.top - viewportPadding;
    const openAbove = availableBelow < 280 && availableAbove > availableBelow;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - rect.width - viewportPadding)
    );
    const width = Math.max(
      260,
      Math.min(rect.width, window.innerWidth - (viewportPadding * 2))
    );

    this.walkInServiceOverlayStyle = {
      position: 'fixed',
      left: left + 'px',
      width: width + 'px',
      zIndex: '10020',
      top: openAbove ? 'auto' : (rect.bottom + gap) + 'px',
      bottom: openAbove ? (window.innerHeight - rect.top + gap) + 'px' : 'auto'
    };
  }

  get currentWalkInTime(): string {
    const now = this.settingsService.salonNow();
    return this.minutesToTime(now.getHours() * 60 + now.getMinutes());
  }

  get createBarbers(): string[] {
    return this.walkInBarberOptions.map(option => option.name);
  }

  private refreshWalkInBarberOptions(): void {
    const service = this.selectedWalkInService;

    if (!service) {
      this.walkInBarberOptions = [];
      return;
    }

    this.walkInBarberOptions = this.bookingService.availableBarbersForWalkIn(
      service.name,
      this.todayKey,
      this.currentWalkInTime,
      service.duration,
      10,
      this.selectedWalkInServiceNames
    );
  }

  get selectedWalkInBarberOption(): WalkInBarberOption | undefined {
    return this.walkInBarberOptions.find(option => option.name === this.newBooking.barber);
  }

  get walkInDuration(): number {
    return this.selectedWalkInService?.duration ?? 0;
  }

  get walkInAmount(): number {
    return this.selectedWalkInService?.amount ?? 0;
  }

  get editBarbers(): string[] {
    if (!this.selectedBooking) return [];
    return this.bookingService.availableBarbersForBooking(this.selectedBooking, this.selectedBooking.date);
  }

  get selectedBookingPastGrace(): boolean {
    return !!this.selectedBooking && this.bookingService.isPastLateArrivalGrace(this.selectedBooking);
  }

  get selectedBookingCustomerCanCancel(): boolean {
    return !!this.selectedBooking
      && this.settingsService.canCustomerCancel(this.selectedBooking.date, this.selectedBooking.time);
  }

  get cancellationHours(): number {
    return this.settingsService.cancellationHours;
  }

  get lateArrivalMinutes(): number {
    return this.settingsService.lateArrivalMinutes;
  }

  onCreateServiceOrDateChange(): void {
    this.newBooking.barber = '';
    this.newBooking.time = this.currentWalkInTime;
    this.refreshWalkInBarberOptions();
  }

  onEditDateChange(): void {
    this.editTime = '';
  }

  onCreateBarberChange(): void {
    this.newBooking.time = this.selectedWalkInBarberOption?.startTime || this.currentWalkInTime;
  }

  onEditBarberChange(): void {
    // Assignment is saved separately; rescheduling continues to use the saved barber.
  }

  get bookings(): AdminBooking[] {
    const term = this.searchTerm.trim().toLowerCase();

    return this.bookingService.all
      .filter(item => {
        if (this.activeTab === 'all') return true;
        if (this.activeTab === 'today') return item.date === this.todayKey && item.status !== 'Cancelled';
        if (this.activeTab === 'upcoming') return item.date > this.todayKey && item.status !== 'Completed' && item.status !== 'Cancelled';
        if (this.activeTab === 'completed') return item.status === 'Completed';
        return item.status === 'Cancelled';
      })
      .filter(item => this.selectedBarber === 'All' || item.barber === this.selectedBarber)
      .filter(item =>
        this.selectedService === 'All'
        || this.bookingServiceNames(item).includes(this.selectedService)
      )
      .filter(item => !this.selectedDate || item.date === this.selectedDate)
      .filter(item => {
        if (!term) return true;
        return [item.code, item.customerName, item.phone, item.service, item.barber]
          .some(value => value.toLowerCase().includes(term));
      })
      .sort((a, b) => a.date.localeCompare(b.date) || this.timeValue(a.time) - this.timeValue(b.time));
  }

  get todayCount(): number {
    return this.bookingService.all.filter(item => item.date === this.todayKey && item.status !== 'Cancelled').length;
  }

  get pendingCount(): number {
    return this.bookingService.all.filter(item => item.status === 'Pending').length;
  }

  get upcomingCount(): number {
    return this.bookingService.all.filter(item => item.date > this.todayKey && item.status !== 'Cancelled' && item.status !== 'Completed').length;
  }

  get cancelledCount(): number {
    return this.bookingService.all.filter(item => item.status === 'Cancelled').length;
  }

  setTab(tab: BookingTab): void {
    this.activeTab = tab;
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedBarber = 'All';
    this.selectedService = 'All';
    this.selectedDate = '';
  }

  openBooking(booking: AdminBooking): void {
    this.selectedBooking = booking;
    this.editBarber = booking.barber;
    this.editDate = booking.date;
    this.editTime = booking.time;
    this.customServiceAmount = booking.specialServiceAmount
      ? String(booking.specialServiceAmount)
      : '';
    this.drawerOpen = true;
    this.feedbackMessage = '';
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    this.selectedBooking = null;
    this.feedbackMessage = '';
  }

  setStatus(status: BookingStatus): void {
    if (!this.selectedBooking) return;
    const result = this.bookingService.updateStatus(this.selectedBooking.id, status);
    this.showFeedback(result.success, result.message);
  }

  saveBarber(): void {
    if (!this.selectedBooking || !this.editBarber) return;
    const result = this.bookingService.assignBarber(this.selectedBooking.id, this.editBarber);
    this.showFeedback(result.success, result.message);
    if (!result.success) this.editBarber = this.selectedBooking.barber;
  }

  saveSchedule(): void {
    if (!this.selectedBooking) return;
    const result = this.bookingService.reschedule(this.selectedBooking.id, this.editDate, this.editTime);
    this.showFeedback(result.success, result.message);
    if (!result.success) {
      this.editDate = this.selectedBooking.date;
      this.editTime = this.selectedBooking.time;
    }
  }

  saveCustomServicePrice(): void {
    if (!this.selectedBooking) return;

    const result = this.bookingService.updateSpecialServiceAmount(
      this.selectedBooking.id,
      Number(this.customServiceAmount)
    );

    this.showFeedback(result.success, result.message);

    if (!result.success) {
      this.customServiceAmount = this.selectedBooking.specialServiceAmount
        ? String(this.selectedBooking.specialServiceAmount)
        : '';
    }
  }

  requestCancel(): void {
    if (this.selectedBooking) this.cancelDialogOpen = true;
  }

  confirmCancel(): void {
    if (!this.selectedBooking) return;
    const result = this.bookingService.cancel(this.selectedBooking.id);
    this.cancelDialogOpen = false;
    this.showFeedback(result.success, result.message);
  }

  openCreateModal(): void {
    if (this.creatingBooking) return;
    this.createModalOpen = true;
    this.feedbackMessage = '';
    this.walkInServiceSearch = '';
    this.walkInServiceDropdownOpen = false;
    this.walkInSelectedServiceNames = [];
    this.walkInBarberOptions = [];
    this.newBooking = {
      customerName: '',
      phone: '',
      service: '',
      barber: '',
      date: this.todayKey,
      time: this.currentWalkInTime,
      notes: ''
    };
  }

  closeCreateModal(): void {
    if (this.creatingBooking) return;
    this.walkInServiceDropdownOpen = false;
    this.walkInServiceSearch = '';
    this.walkInServiceOverlayStyle = {};
    this.walkInSelectedServiceNames = [];
    this.walkInBarberOptions = [];
    this.createModalOpen = false;
    this.walkInServiceTriggerElement = undefined;
  }

  get canCreateWalkIn(): boolean {
    const digits = this.newBooking.phone.replace(/\D/g, '');

    return !!(
      this.newBooking.customerName.trim()
      && this.selectedWalkInService
      && this.newBooking.barber
      && this.selectedWalkInBarberOption
      && (!digits || /^3\d{9}$/.test(digits))
    );
  }

  createBooking(): void {
    if (this.creatingBooking) return;
    const form = this.newBooking;
    const digits = form.phone.replace(/\D/g, '');
    const service = this.selectedWalkInService;

    if (!form.customerName.trim() || !service || !form.barber) {
      this.showFeedback(false, 'Enter the customer name and select a service and available barber.');
      return;
    }

    if (digits && !/^3\d{9}$/.test(digits)) {
      this.showFeedback(false, 'Enter a valid Pakistan mobile number or leave the phone field empty.');
      return;
    }

    const freshOptions = this.bookingService.availableBarbersForWalkIn(
      service.name,
      this.todayKey,
      this.currentWalkInTime,
      service.duration,
      10,
      this.selectedWalkInServiceNames
    );
    const selectedOption = freshOptions.find(option => option.name === form.barber);

    if (!selectedOption) {
      this.newBooking.barber = '';
      this.showFeedback(false, 'That barber is no longer available today. Please select another barber.');
      return;
    }

    this.newBooking.time = selectedOption.startTime;

    const bookingInput = {
      customerName: form.customerName.trim(),
      phone: digits ? '+92 ' + digits.slice(0, 3) + ' ' + digits.slice(3) : '',
      service: service.name,
      serviceNames: [...this.selectedWalkInServiceNames],
      duration: service.duration,
      barber: form.barber,
      date: this.todayKey,
      time: selectedOption.startTime,
      amount: service.amount,
      notes: '',
      groupSize: 1,
      serviceLocation: 'Salon' as const
    };

    this.creatingBooking = true;
    if (this.bookingService.createWalkInThroughApi(
      bookingInput,
      result => {
        this.creatingBooking = false;
        this.showFeedback(result.success, result.message);
        if (result.success) this.createModalOpen = false;
      },
      message => {
        this.creatingBooking = false;
        this.showFeedback(false, message);
      }
    )) {
      return;
    }

    this.creatingBooking = false;
    const result = this.bookingService.addWalkInBooking(bookingInput);
    this.showFeedback(result.success, result.message);
    if (result.success) this.createModalOpen = false;
  }

  onPhoneInput(value: string): void {
    this.newBooking.phone = value.replace(/\D/g, '').slice(0, 10);
  }

  statusIcon(status: BookingStatus): string {
    if (status === 'Confirmed') return 'bi-check-circle';
    if (status === 'Pending') return 'bi-clock-history';
    if (status === 'Completed') return 'bi-check2-all';
    return 'bi-x-circle';
  }

  private showFeedback(success: boolean, message: string): void {
    this.feedbackType = success ? 'success' : 'error';
    this.feedbackMessage = message;
    window.setTimeout(() => {
      if (this.feedbackMessage === message) this.feedbackMessage = '';
    }, 3500);
  }

  private bookingServiceNames(item: AdminBooking): string[] {
    if (item.serviceNames?.length) {
      return item.serviceNames.map(name => name.trim()).filter(Boolean);
    }

    const serialized = String(item.service || '').trim();
    if (!serialized) return [];

    const exactCatalogueService = this.bookingService.services.find(
      service => service.name.trim().toLowerCase() === serialized.toLowerCase()
    );

    if (exactCatalogueService) {
      return [exactCatalogueService.name];
    }

    return serialized.split(',').map(name => name.trim()).filter(Boolean);
  }

  private toDateKey(date: Date): string {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  private slotsForDuration(duration: number, dateKey: string, allowWalkInSameDay = false): string[] {
    if (!dateKey) return [];

    const date = new Date(dateKey + 'T12:00:00');

    if (allowWalkInSameDay) {
      if (dateKey !== this.todayKey) return [];
    } else if (!this.settingsService.isBookingDateAllowed(date)) {
      return [];
    }

    const hours = this.settingsService.hoursForDate(date);
    if (!hours) return [];

    const slots: string[] = [];
    const interval = this.settingsService.bookingInterval;

    const now = this.settingsService.salonNow();
    const isToday = dateKey === this.todayKey;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (let minutes = hours.start; minutes + duration <= hours.end; minutes += interval) {
      if (isToday && minutes <= nowMinutes) continue;
      slots.push(this.minutesToTime(minutes));
    }

    return slots;
  }

  private minutesToTime(totalMinutes: number): string {
    let hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return hour + ':' + String(minute).padStart(2, '0') + ' ' + period;
  }

  private timeValue(time: string): number {
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
