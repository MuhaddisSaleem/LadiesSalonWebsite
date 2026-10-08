import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, map } from 'rxjs';
import { AdminBarberService } from '../admin/barbers/admin-barber.service';
import { AdminServiceCategory, AdminServiceService } from '../admin/services/admin-service.service';
import { AdminSettingsService } from '../admin/settings/admin-settings.service';
import { AdminBookingService } from '../admin/bookings/admin-booking.service';
import { CatalogApiService } from '../core/catalog-api.service';
import { BookingApiService } from '../core/booking-api.service';
import { LoadMoreDirective } from '../shared/load-more.directive';
import { ScrollRevealDirective } from '../shared/scroll-reveal.directive';

interface Service {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  duration: number;
  price: number;
  originalPrice: number;
  discountPrice: number | null;
  image: string;
}
interface Barber { id: number; name: string; rating: number; experience: string; image: string; }
interface BookingDate { date: Date; day: string; dateNumber: number; month: string; fullDate: string; }
interface CalendarCell { date: Date | null; dayNumber: number | null; fullDate: string | null; }
interface BookingPerson { id: number; label: string; selectedServices: Service[]; selectedBarber: Barber | 'any' | null; }
interface ConfirmedAssignment { person: string; barber: string; time: string; }
interface PersonSchedule { personId: number; time: string; barber: Barber; suggested: boolean; }

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollRevealDirective, LoadMoreDirective],
  templateUrl: './booking.component.html',
  styleUrls: ['./booking.component.scss', './group-booking.component.scss']
})
export class BookingComponent implements OnInit, OnDestroy {
  get salonServices(): Service[] {
    return this.serviceService.active
      .filter(service => this.serviceService.getCategoryById(service.categoryId)?.status !== 'Inactive')
      .map(service => ({
      id: service.id,
      name: service.name,
      categoryId: service.categoryId,
      categoryName: service.categoryName,
      duration: service.duration,
      price: this.serviceService.effectivePrice(service),
      originalPrice: service.originalPrice,
      discountPrice: service.discountPrice,
      image: service.image
    }));
  }

  get homeServices(): Service[] {
    return this.serviceService.homeActive
      .filter(service => this.serviceService.getCategoryById(service.categoryId)?.status !== 'Inactive')
      .map(service => ({
      id: service.id,
      name: service.name,
      categoryId: service.categoryId,
      categoryName: service.categoryName,
      duration: service.duration,
      price: this.serviceService.effectiveHomePrice(service),
      originalPrice: Number(service.homeOriginalPrice),
      discountPrice: service.homeDiscountPrice,
      image: service.image
    }));
  }

  get services(): Service[] {
    return this.serviceLocation === 'home' ? this.homeServices : this.salonServices;
  }

  get serviceCategories(): AdminServiceCategory[] {
    const source = this.serviceLocation === 'home' ? this.homeServices : this.salonServices;
    const availableIds = new Set(source.map(service => service.categoryId));

    return this.serviceService.activeCategories
      .filter(category => availableIds.has(category.id));
  }

  get filteredSalonServices(): Service[] {
    const services = this.filterServicesByCategory(this.salonServices);
    const term = this.serviceSearchTerm.trim().toLowerCase();

    if (!term) return services;

    return services.filter(service =>
      service.name.toLowerCase().includes(term)
      || service.categoryName.toLowerCase().includes(term)
    );
  }

  private readonly initialVisibleServiceCount = 12;
  private readonly serviceLoadBatchSize = 4;
  private visibleServiceLimit = this.initialVisibleServiceCount;
  loadingMoreServices = false;
  private serviceRevealTimer?: ReturnType<typeof setTimeout>;

  get visibleSalonServices(): Service[] {
    const services = this.filteredSalonServices;

    if (!this.isServiceCategorySelected('all') || this.serviceSearchTerm.trim()) {
      return services;
    }

    return services.slice(0, this.visibleServiceLimit);
  }

  get visibleHomeServices(): Service[] {
    const services = this.filterServicesByCategory(this.homeServices);

    if (!this.isServiceCategorySelected('all')) {
      return services;
    }

    return services.slice(0, this.visibleServiceLimit);
  }

  get hasMoreServices(): boolean {
    if (!this.isServiceCategorySelected('all')) return false;

    const total = this.serviceLocation === 'salon'
      ? (this.serviceSearchTerm.trim() ? 0 : this.filteredSalonServices.length)
      : this.filterServicesByCategory(this.homeServices).length;

    return total > this.visibleServiceLimit;
  }

  trackService(_index: number, service: Service): number {
    return service.id;
  }

  loadRemainingServices(): void {
    if (!this.hasMoreServices || this.loadingMoreServices) return;

    this.loadingMoreServices = true;

    // Add a small batch instead of inserting the full remaining catalog.
    // This keeps the document height growing gradually and prevents scroll jumps.
    this.serviceRevealTimer = setTimeout(() => {
      const total = this.serviceLocation === 'salon'
        ? this.filteredSalonServices.length
        : this.filterServicesByCategory(this.homeServices).length;

      this.visibleServiceLimit = Math.min(
        this.visibleServiceLimit + this.serviceLoadBatchSize,
        total
      );

      this.loadingMoreServices = false;
      this.serviceRevealTimer = undefined;
    }, 160);
  }

  resetServiceReveal(): void {
    clearTimeout(this.serviceRevealTimer);
    this.serviceRevealTimer = undefined;
    this.loadingMoreServices = false;
    this.visibleServiceLimit = this.initialVisibleServiceCount;
  }

  ngOnDestroy(): void {
    clearTimeout(this.serviceRevealTimer);
  }

  selectServiceCategory(category: 'all' | number): void {
    this.resetServiceReveal();
    this.selectedServiceCategory = category;
  }

  isServiceCategorySelected(category: 'all' | number): boolean {
    if (category === 'all') {
      return this.selectedServiceCategory === 'all'
        || !this.serviceCategories.some(item => item.id === this.selectedServiceCategory);
    }

    return this.selectedServiceCategory === category;
  }

  trackBarber(_index: number, barber: Barber): number {
    return barber.id;
  }

  get barbers(): Barber[] {
    return this.barberService.active.map(barber => ({
      id: barber.id,
      name: barber.name,
      rating: barber.rating,
      experience: barber.experience,
      image: barber.image || 'assets/images/barber-placeholder.svg'
    }));
  }

  serviceLocation: 'salon' | 'home' = 'salon';
  selectedServiceCategory: 'all' | number = 'all';
  serviceSearchTerm = '';
  bookingMode: 'single' | 'group' = 'single';
  groupStrategy: 'parallel' | 'sequential' = 'parallel';
  homeAddress = '';
  specialHomeService = '';
  private readonly homeCustomServiceDuration = 60;
  participants: BookingPerson[] = [this.createPerson(1, 'You')];
  activeParticipantIndex = 0;
  private nextPersonId = 2;
  private availabilityGeneration = 0;

  selectedDate: BookingDate | null = null;
  selectedTime: string | null = null;
  calendarDate = this.startOfMonth(this.settingsService.salonNow());
  calendarCells: CalendarCell[] = [];
  availableTimes: string[] = [];
  sequentialSchedule: PersonSchedule[] = [];

  customer = { name: '', phone: '', notes: '' };
  phoneTouched = false;
  bookingValidationMessage = '';
  bookingConfirmed = false;
  bookingSubmittedStatus: 'Confirmed' | 'Pending' = 'Confirmed';
  confirmedAssignments: ConfirmedAssignment[] = [];

  constructor(
    private readonly barberService: AdminBarberService,
    private readonly serviceService: AdminServiceService,
    private readonly settingsService: AdminSettingsService,
    private readonly bookingService: AdminBookingService,
    private readonly bookingApi: BookingApiService,
    private readonly catalogApi?: CatalogApiService
  ) {}

  ngOnInit(): void {
    this.buildCalendar();

    this.bookingService.changes$.subscribe(() => {
      queueMicrotask(() => this.reconcileAvailability());
    });

    this.catalogApi?.changes$.subscribe(scope => {
      queueMicrotask(() => {
        if (scope === 'settings') {
          this.buildCalendar();
        }

        this.reconcileAvailability();
      });
    });
  }

  @HostListener('window:storage', ['$event'])
  @HostListener('window:focus')
  refreshAvailability(event?: StorageEvent): void {
    if (this.catalogApi) {
      if (event) return;

      this.bookingService.refreshFromApi();
      void this.catalogApi.refreshAllAndNotify();
      return;
    }

    if (event && event.storageArea !== window.localStorage) return;
    const keys = ['royal-barbers.admin-barbers.v1', 'royal-barbers.admin-services.v1',
      'royal-barbers.admin-service-categories.v1', 'royal-barbers.admin-settings.v1',
      'royal-barbers.admin-bookings.v1'];
    if (event?.key && !keys.includes(event.key)) return;

    this.barberService.refreshFromStorage();
    this.serviceService.refreshFromStorage();
    this.settingsService.refreshFromStorage();
    this.bookingService.refreshFromStorage();
    this.reconcileAvailability();
  }

  private reconcileAvailability(): void {
    if (this.bookingConfirmed) return;

    const services = new Map(this.services.map(service => [service.id, service]));
    for (const person of this.participants) {
      person.selectedServices = person.selectedServices
        .map(service => services.get(service.id))
        .filter((service): service is Service => !!service);

      if (person.selectedBarber && person.selectedBarber !== 'any') {
        person.selectedBarber = this.barbers.find(
          barber => barber.id === (person.selectedBarber as Barber).id
        ) || null;

        if (person.selectedBarber && !this.barberSupportsPerson(person.selectedBarber, person)) {
          person.selectedBarber = null;
        }
      }
    }

    this.generateAvailableTimes();
  }

  get noAvailabilityMessage(): string {
    if (!this.selectedDate) return 'Select a date to see available times.';
    const hours = this.settingsService.hoursForDate(this.selectedDate.date);
    if (!hours) return 'The salon is closed on this date. Please choose another date.';
    if (!this.settingsService.isBookingDateAllowed(this.selectedDate.date)) {
      return 'This date is outside the salon’s booking window. Please choose an available date.';
    }
    const now = this.settingsService.salonNow();
    const earliest = this.selectedDate.fullDate === this.formatDate(now)
      ? Math.max(hours.start, now.getHours() * 60 + now.getMinutes() + 1) : hours.start;
    const interval = this.bookingService.apiEnabled && this.bookingMode === 'single'
      ? Math.max(1, this.getPersonDuration(this.activeParticipant))
      : this.settingsService.bookingInterval;
    for (const person of this.participants) {
      const duration = this.getPersonDuration(person);
      if (!Number.isFinite(duration) || duration <= 0) return 'The selected service duration needs correcting. Please contact the salon.';
      const candidates = (person.selectedBarber && person.selectedBarber !== 'any' ? [person.selectedBarber] : this.barbers)
        .filter(barber => this.barberSupportsPerson(barber, person)
          && this.barberService.isAvailableOnDate(barber.id, this.selectedDate!.fullDate));
      if (!candidates.length) return 'No available barber provides all the selected services on this date. Try another barber or date.';
      const shifts = candidates.map(barber => this.barberService.workingWindowFor(barber.id))
        .filter((shift): shift is { start: number; end: number } => !!shift);
      if (!shifts.length) return 'The selected barber’s working hours need correcting. Please contact the salon or choose another barber.';
      const fits = shifts.some(shift => {
        const start = hours.start + Math.ceil((Math.max(earliest, shift.start) - hours.start) / interval) * interval;
        return start + duration <= Math.min(hours.end, shift.end);
      });
      if (!fits) {
        const end = Math.min(hours.end, Math.max(...shifts.map(shift => shift.end)));
        return `No remaining ${duration}-minute slot fits before ${this.minutesToTime(end)} on this date. Choose another date or barber.`;
      }
    }
    if (this.bookingMode === 'group' && this.serviceLocation === 'salon') {
      return this.groupStrategy === 'sequential'
        ? 'The selected barber cannot fit the complete group between existing appointments. Try another date or barber.'
        : 'No simultaneous slots are available with a different eligible barber for each person. Try separate times or another date.';
    }
    return 'The remaining slots for these services overlap existing appointments. Try another barber or date.';
  }

  get businessName(): string {
    return this.settingsService.current.businessName || 'Salon';
  }

  get businessPhone(): string {
    return this.settingsService.current.businessPhone || 'Not configured';
  }

  get cancellationHours(): number {
    return this.settingsService.cancellationHours;
  }

  get lateArrivalMinutes(): number {
    return this.settingsService.lateArrivalMinutes;
  }

  get autoConfirmBookings(): boolean {
    return this.settingsService.current.autoConfirmBookings;
  }

  get activeParticipant(): BookingPerson { return this.participants[this.activeParticipantIndex]; }
  get selectedServices(): Service[] { return this.activeParticipant.selectedServices; }
  get selectedBarber(): Barber | 'any' | null { return this.activeParticipant.selectedBarber; }
  get isPakistanPhoneValid(): boolean { return /^3\d{9}$/.test(this.customer.phone); }
  get hasHomeCustomService(): boolean {
    return this.serviceLocation === 'home' && this.specialHomeService.trim().length > 0;
  }

  get allServicesSelected(): boolean {
    return this.participants.every(person =>
      person.selectedServices.length > 0 || this.hasHomeCustomService
    );
  }

  get allBarbersSelected(): boolean {
    return this.serviceLocation === 'home'
      || this.participants.every(person => !!person.selectedBarber);
  }

  get allParticipantsReady(): boolean {
    return this.allServicesSelected && this.allBarbersSelected;
  }

  get customerDetailsComplete(): boolean {
    return this.customer.name.trim().length > 0
      && this.isPakistanPhoneValid
      && (this.serviceLocation !== 'home' || this.homeAddress.trim().length > 0);
  }
  get totalPrice(): number { return this.participants.reduce((total, person) => total + this.getPersonPrice(person), 0); }
  get totalDuration(): number { return this.getPersonDuration(this.activeParticipant); }
  get monthLabel(): string { return this.calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  get canGoPreviousMonth(): boolean { return this.calendarDate.getTime() > this.startOfMonth(this.settingsService.salonNow()).getTime(); }

  get canGoNextMonth(): boolean {
    const maxDate = this.settingsService.salonNow();
    maxDate.setDate(maxDate.getDate() + this.settingsService.maxAdvanceDays);
    return this.calendarDate.getTime() < this.startOfMonth(maxDate).getTime();
  }

  onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let digits = input.value.replace(/\D/g, '');

    // The UI already shows +92. Accept pasted Pakistani formats as well.
    if (digits.startsWith('92')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);

    this.customer.phone = digits.slice(0, 10);
    input.value = this.customer.phone;
    this.phoneTouched = true;
    this.clearValidationMessage();
  }

  onPhoneBlur(): void { this.phoneTouched = true; }
  clearValidationMessage(): void { this.bookingValidationMessage = ''; }

  activateHomeService(): void {
    const changed = this.serviceLocation !== 'home';
    this.setServiceLocation('home');

    if (!changed || typeof document === 'undefined') return;

    const scrollToServices = () => {
      document.getElementById('service-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(scrollToServices));
      return;
    }

    setTimeout(scrollToServices, 0);
  }

  setServiceLocation(location: 'salon' | 'home'): void {
    if (this.serviceLocation === location) return;

    const destinationServices = location === 'home' ? this.homeServices : this.salonServices;
    const destinationById = new Map(destinationServices.map(service => [service.id, service]));

    this.serviceLocation = location;
    this.resetServiceReveal();
    this.selectedServiceCategory = 'all';
    this.clearValidationMessage();
    this.clearSelectedTime();

    if (location === 'home') {
      this.bookingMode = 'single';
      this.groupStrategy = 'parallel';
      this.participants = [this.participants[0] || this.createPerson(1, 'You')];
      this.activeParticipantIndex = 0;
      this.nextPersonId = 2;
    }

    this.participants.forEach(person => {
      person.selectedServices = person.selectedServices
        .map(service => destinationById.get(service.id))
        .filter((service): service is Service => !!service);

      person.selectedBarber = location === 'home'
        ? 'any'
        : (person.selectedBarber === 'any' ? null : person.selectedBarber);
    });

    if (location === 'salon') {
      this.homeAddress = '';
      this.specialHomeService = '';
    }

    this.generateAvailableTimes();
  }

  onSpecialHomeServiceInput(): void {
    if (this.serviceLocation !== 'home') {
      this.setServiceLocation('home');
    }

    this.activeParticipant.selectedBarber = 'any';
    this.clearValidationMessage();
    this.clearSelectedTime();
    this.generateAvailableTimes();
  }

  setBookingMode(mode: 'single' | 'group'): void {
    if (this.serviceLocation === 'home' && mode === 'group') return;
    if (this.bookingMode === mode) return;

    this.bookingMode = mode;
    this.clearValidationMessage();
    this.clearSelectedTime();

    if (mode === 'group') {
      if (this.participants.length === 1) {
        this.participants.push(this.createPerson(this.nextPersonId++, 'Person 2'));
      }
    } else {
      this.participants = [this.participants[0]];
      this.activeParticipantIndex = 0;
      this.groupStrategy = 'parallel';
    }

    this.generateAvailableTimes();
  }

  setGroupStrategy(strategy: 'parallel' | 'sequential'): void {
    if (this.groupStrategy === strategy) return;

    this.groupStrategy = strategy;
    this.clearValidationMessage();
    this.clearSelectedTime();
    this.participants.forEach(person => person.selectedBarber = null);
    this.generateAvailableTimes();
  }

  addPerson(): void {
    if (this.participants.length >= 4) return;

    const person = this.createPerson(this.nextPersonId++, `Person ${this.participants.length + 1}`);
    if (this.groupStrategy === 'sequential' && this.participants[0]?.selectedBarber) {
      person.selectedBarber = this.participants[0].selectedBarber;
    }

    this.participants.push(person);
    this.activeParticipantIndex = this.participants.length - 1;
    this.clearValidationMessage();
    this.clearSelectedTime();
    this.generateAvailableTimes();
  }

  removePerson(index: number): void {
    if (index === 0 || this.participants.length <= 2) return;

    this.participants.splice(index, 1);
    this.participants.forEach((person, i) => person.label = i === 0 ? 'You' : `Person ${i + 1}`);
    this.activeParticipantIndex = Math.min(this.activeParticipantIndex, this.participants.length - 1);
    this.clearValidationMessage();
    this.clearSelectedTime();
    this.generateAvailableTimes();
  }

  selectParticipant(index: number): void {
    if (index < 0 || index >= this.participants.length) return;
    this.activeParticipantIndex = index;
  }

  toggleServiceForLocation(service: Service, location: 'salon' | 'home'): void {
    const locationChanged = this.serviceLocation !== location;

    if (locationChanged) {
      this.setServiceLocation(location);
      const person = this.activeParticipant;
      const existingIndex = person.selectedServices.findIndex(item => item.id === service.id);

      if (existingIndex === -1) {
        person.selectedServices.push(service);
      } else {
        person.selectedServices[existingIndex] = service;
      }

      this.ensureCompatibleBarberSelection();
      if (location === 'home') person.selectedBarber = 'any';
      this.clearSelectedTime();
      this.generateAvailableTimes();
      return;
    }

    this.toggleService(service);
  }

  toggleService(service: Service): void {
    this.clearValidationMessage();
    const person = this.activeParticipant;

    if (this.isServiceSelected(service.id)) {
      person.selectedServices = person.selectedServices.filter(item => item.id !== service.id);
    } else {
      person.selectedServices.push(service);
    }

    this.ensureCompatibleBarberSelection();
    if (this.serviceLocation === 'home') person.selectedBarber = 'any';
    this.clearSelectedTime();
    this.generateAvailableTimes();
  }

  isServiceSelected(serviceId: number): boolean {
    return this.activeParticipant.selectedServices.some(service => service.id === serviceId);
  }

  isServiceSelectedForLocation(serviceId: number, location: 'salon' | 'home'): boolean {
    return this.serviceLocation === location && this.isServiceSelected(serviceId);
  }

  isServiceDisabled(_service: Service): boolean {
    return false;
  }

  selectBarber(barber: Barber | 'any'): void {
    this.clearValidationMessage();

    if (barber !== 'any') {
      if (!this.barberService.isAvailableOnDate(barber.id, this.barberStatusDate)) {
        const label = this.barberService.availabilityLabelForDate(barber.id, this.barberStatusDate) || 'Not available';
        this.bookingValidationMessage = barber.name + ' is ' + label.toLowerCase() + ' for this date.';
        return;
      }

      const unsupportedPerson = this.bookingMode === 'group' && this.groupStrategy === 'sequential'
        ? this.participants.find(person => !this.barberSupportsPerson(barber, person))
        : (!this.barberSupportsPerson(barber, this.activeParticipant) ? this.activeParticipant : undefined);

      if (unsupportedPerson) {
        this.bookingValidationMessage = barber.name + ' does not provide all services selected for ' + unsupportedPerson.label + '.';
        return;
      }
    }

    if (this.bookingMode === 'group' && this.groupStrategy === 'sequential') {
      this.participants.forEach(person => person.selectedBarber = barber);
    } else {
      this.activeParticipant.selectedBarber = barber;
    }

    this.clearSelectedTime();
    this.generateAvailableTimes();
  }

  selectCalendarDay(cell: CalendarCell): void {
    if (!cell.date || this.isDateDisabled(cell.date)) return;

    this.clearValidationMessage();
    this.setSelectedDate(cell.date);

    this.participants.forEach(person => {
      if (this.serviceLocation === 'home') {
        person.selectedBarber = 'any';
        return;
      }

      if (
        person.selectedBarber
        && person.selectedBarber !== 'any'
        && (
          !this.barberService.isAvailableOnDate(person.selectedBarber.id, this.barberStatusDate)
          || !this.barberSupportsPerson(person.selectedBarber, person)
        )
      ) {
        person.selectedBarber = null;
      }
    });

    this.clearSelectedTime();
    this.generateAvailableTimes();
  }

  isPastDate(date: Date | null): boolean {
    if (!date) return false;
    return this.startOfDay(date).getTime() < this.startOfDay(this.settingsService.salonNow()).getTime();
  }

  isDateDisabled(date: Date | null): boolean {
    if (!date) return false;
    return !this.settingsService.isBookingDateAllowed(date);
  }

  isBarberUnavailable(barber: Barber): boolean {
    return !this.barberService.isAvailableOnDate(barber.id, this.barberStatusDate)
      || !this.barberSupportsPerson(barber, this.activeParticipant);
  }

  getBarberAvailabilityLabel(barber: Barber): string {
    if (!this.barberSupportsPerson(barber, this.activeParticipant)) {
      return 'Service not offered';
    }

    return this.barberService.availabilityLabelForDate(barber.id, this.barberStatusDate);
  }

  private get barberStatusDate(): string {
    return this.selectedDate?.fullDate || this.formatDate(this.settingsService.salonNow());
  }

  previousMonth(): void {
    if (!this.canGoPreviousMonth) return;

    const previous = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() - 1, 1);
    const currentMonth = this.startOfMonth(this.settingsService.salonNow());
    this.calendarDate = previous.getTime() < currentMonth.getTime() ? currentMonth : previous;
    this.buildCalendar();
  }

  nextMonth(): void {
    if (!this.canGoNextMonth) return;
    this.calendarDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() + 1, 1);
    this.buildCalendar();
  }

  private buildCalendar(): void {
    const year = this.calendarDate.getFullYear();
    const month = this.calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: CalendarCell[] = [];

    for (let i = 0; i < firstDay; i++) {
      cells.push({ date: null, dayNumber: null, fullDate: null });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      cells.push({ date, dayNumber: day, fullDate: this.formatDate(date) });
    }

    this.calendarCells = cells;
  }

  private setSelectedDate(date: Date): void {
    this.selectedDate = {
      date,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateNumber: date.getDate(),
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      fullDate: this.formatDate(date)
    };
  }

  generateAvailableTimes(): void {
    const generation = ++this.availabilityGeneration;

    if (!this.selectedDate || this.isDateDisabled(this.selectedDate.date) || !this.allParticipantsReady) {
      this.availableTimes = [];
      return;
    }

    const slots: string[] = [];
    const today = this.startOfDay(this.settingsService.salonNow());
    const selectedDay = this.startOfDay(this.selectedDate.date);
    const now = this.settingsService.salonNow();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const apiSingleBooking = this.bookingService.apiEnabled && this.bookingMode === 'single';
    const singleDuration = Math.max(1, this.getPersonDuration(this.activeParticipant));

    for (const window of this.businessWindows) {
      if (apiSingleBooking) {
        // Anchor the first visible time to the salon's normal booking grid, then advance
        // by the actual selected service duration. Example: 40 min => 1:00, 1:40, 2:20.
        let firstStart = window.start;

        if (selectedDay.getTime() === today.getTime()) {
          const earliest = Math.max(window.start, nowMinutes + 1);
          const baseInterval = this.settingsService.bookingInterval;
          firstStart = window.start
            + Math.ceil((earliest - window.start) / baseInterval) * baseInterval;
        }

        for (
          let minutes = firstStart;
          minutes + singleDuration <= window.end;
          minutes += singleDuration
        ) {
          slots.push(this.minutesToTime(minutes));
        }

        continue;
      }

      for (let minutes = window.start; minutes < window.end; minutes += this.settingsService.bookingInterval) {
        if (selectedDay.getTime() === today.getTime() && minutes <= nowMinutes) continue;

        const time = this.minutesToTime(minutes);
        const valid = this.bookingMode === 'group' && this.groupStrategy === 'sequential'
          ? !!this.buildSequentialSchedule(time)
          : !!this.resolveParallelBarbers(time);

        if (valid) slots.push(time);
      }
    }

    // For a normal single booking, the API is the final source of truth.
    // This prevents stale client-side booking snapshots from advertising an occupied slot.
    if (this.bookingService.apiEnabled && this.bookingMode === 'single') {
      if (!slots.length) {
        this.availableTimes = [];
        this.clearSelectedTime();
        return;
      }

      const person = this.activeParticipant;
      const duration = this.getPersonDuration(person);
      const service = person.selectedServices.map(item => item.name).join(', ') || 'Custom Home Service';
      const barber = person.selectedBarber && person.selectedBarber !== 'any'
        ? person.selectedBarber.name
        : undefined;

      this.availableTimes = [];

      forkJoin(slots.map(time =>
        this.bookingApi.checkAvailability({
          service,
          serviceNames: person.selectedServices.map(item => item.name),
          specialService: this.specialHomeService.trim(),
          date: this.selectedDate!.fullDate,
          time,
          duration,
          barber,
          serviceLocation: this.serviceLocation === 'home' ? 'Home' : 'Salon'
        }).pipe(map(result => ({ time, available: result.available })))
      )).subscribe({
        next: results => {
          if (generation !== this.availabilityGeneration) return;

          this.availableTimes = results
            .filter(result => result.available)
            .map(result => result.time);

          if (this.selectedTime && !this.availableTimes.includes(this.selectedTime)) {
            this.clearSelectedTime();
          }
        },
        error: () => {
          if (generation !== this.availabilityGeneration) return;
          this.availableTimes = [];
          this.clearSelectedTime();
          this.bookingValidationMessage = 'Could not load current availability. Please try again.';
        }
      });
      return;
    }

    this.availableTimes = slots;

    // Never keep a stale selection after services/barber/date availability changes.
    if (this.selectedTime && !this.availableTimes.includes(this.selectedTime)) {
      this.clearSelectedTime();
    }
  }

  selectTime(time: string): void {
    if (!this.availableTimes.includes(time)) return;

    this.clearValidationMessage();
    this.selectedTime = time;
    this.sequentialSchedule = this.bookingMode === 'group' && this.groupStrategy === 'sequential'
      ? (this.buildSequentialSchedule(time) || [])
      : [];
  }

  isTimeSelectedForBooking(time: string): boolean {
    if (this.selectedTime === time) return true;
    return this.bookingMode === 'group'
      && this.groupStrategy === 'sequential'
      && this.sequentialSchedule.some(slot => slot.time === time);
  }

  getPersonBookingTime(index: number): string {
    if (!this.selectedTime) return '';
    if (this.bookingMode !== 'group' || this.groupStrategy !== 'sequential') return this.selectedTime;

    return this.sequentialSchedule.find(slot => slot.personId === this.participants[index]?.id)?.time || '';
  }

  isSuggestedPersonTime(index: number): boolean {
    if (this.bookingMode !== 'group' || this.groupStrategy !== 'sequential') return false;
    const person = this.participants[index];
    return !!this.sequentialSchedule.find(slot => slot.personId === person?.id)?.suggested;
  }

  getSuggestedTimeMessage(index: number): string {
    if (!this.isSuggestedPersonTime(index)) return '';
    return `Previous slot unavailable — suggested ${this.getPersonBookingTime(index)}`;
  }

  confirmBooking(): void {
    if (this.bookingConfirmed) return;
    if (!this.validateBookingBeforeConfirm() || !this.selectedTime || !this.selectedDate) return;

    // API-backed single bookings must be re-checked asynchronously. generateAvailableTimes()
    // itself uses async server validation, so calling it and immediately inspecting the array
    // incorrectly made every valid selected slot look unavailable.
    if (this.bookingService.apiEnabled && this.bookingMode === 'single') {
      const time = this.selectedTime;
      const date = this.selectedDate.fullDate;
      const person = this.activeParticipant;
      const service = person.selectedServices.map(item => item.name).join(', ') || 'Custom Home Service';
      const requestedBarber = person.selectedBarber && person.selectedBarber !== 'any'
        ? person.selectedBarber.name
        : undefined;

      this.bookingApi.checkAvailability({
        service,
        serviceNames: person.selectedServices.map(item => item.name),
        specialService: this.specialHomeService.trim(),
        date,
        time,
        duration: this.getPersonDuration(person),
        barber: requestedBarber,
        serviceLocation: this.serviceLocation === 'home' ? 'Home' : 'Salon'
      }).subscribe({
        next: result => {
          // Ignore an old response if the customer changed date/time while the request was running.
          if (this.selectedTime !== time || this.selectedDate?.fullDate !== date) return;

          if (!result.available) {
            this.refreshAfterAvailabilityConflict('This time slot is no longer available. Please choose another time.');
            return;
          }

          const barber = this.resolveSingleBarberFromServer(person, result.eligibleBarbers, date);
          if (!barber) {
            this.refreshAfterAvailabilityConflict('No eligible barber is available for this time. Please choose another time.');
            return;
          }

          this.submitOnlineBooking(new Map([[person.id, barber]]));
        },
        error: () => {
          this.showValidationError('Could not verify this time slot. Please try again.', 'date-time-section');
        }
      });
      return;
    }

    // Group/local-mode availability is synchronous, so it can still be checked immediately.
    this.generateAvailableTimes();
    if (!this.selectedTime || !this.availableTimes.includes(this.selectedTime)) {
      this.showValidationError('This time slot is no longer available. Please choose another time.', 'date-time-section');
      return;
    }

    const assignments = this.resolveBarberAssignments(this.selectedTime);
    if (!assignments) {
      this.refreshAfterAvailabilityConflict('This time slot is no longer available. Please choose another time.');
      return;
    }

    this.submitOnlineBooking(assignments);
  }

  private resolveSingleBarberFromServer(
    person: BookingPerson,
    eligibleBarbers: string[],
    date: string
  ): Barber | null {
    const eligible = new Set(eligibleBarbers);
    const selected = person.selectedBarber;

    if (selected && selected !== 'any') {
      return eligible.has(selected.name) ? selected : null;
    }

    return this.barbers
      .filter(barber => eligible.has(barber.name) && this.barberSupportsPerson(barber, person))
      .sort((a, b) => this.compareAutoAssignedBarbers(a, b, date))[0] || null;
  }

  private refreshAfterAvailabilityConflict(message: string): void {
    this.clearSelectedTime();
    this.availableTimes = [];
    this.bookingService.refreshFromApi();
    this.generateAvailableTimes();
    this.showValidationError(message, 'date-time-section');
  }

  private submitOnlineBooking(assignments: Map<number, Barber>): void {
    if (!this.selectedTime || !this.selectedDate) return;

    this.bookingValidationMessage = '';

    const phone = '+92 ' + this.customer.phone.slice(0, 3) + ' ' + this.customer.phone.slice(3);
    const onlineBookings = this.participants.map((person, index) => {
      const barber = assignments.get(person.id);
      const time = this.getPersonBookingTime(index);

      const standardServices = person.selectedServices.map(service => service.name).join(', ');

      return {
        customerName: this.customer.name.trim(),
        phone,
        service: standardServices || 'Custom Home Service',
        serviceNames: person.selectedServices.map(item => item.name),
        duration: this.getPersonDuration(person),
        barber: barber?.name || '',
        date: this.selectedDate!.fullDate,
        time,
        amount: this.getPersonPrice(person),
        notes: this.customer.notes.trim(),
        groupSize: this.participants.length,
        serviceLocation: this.serviceLocation === 'home' ? 'Home' as const : 'Salon' as const,
        serviceAddress: this.serviceLocation === 'home' ? this.homeAddress.trim() : '',
        specialService: this.serviceLocation === 'home' ? this.specialHomeService.trim() : ''
      };
    });

    if (onlineBookings.some(item => !item.barber || !item.time)) {
      this.showValidationError('We could not complete the barber assignment. Please choose another time.', 'date-time-section');
      return;
    }

    const completeBooking = () => {
      this.bookingSubmittedStatus = this.hasHomeCustomService
        ? 'Pending'
        : (this.autoConfirmBookings ? 'Confirmed' : 'Pending');
      this.confirmedAssignments = [];

      this.participants.forEach((person, index) => {
        const barber = assignments.get(person.id);
        if (!barber) return;

        const personStartTime = this.getPersonBookingTime(index);
        this.confirmedAssignments.push({ person: person.label, barber: barber.name, time: personStartTime });
      });

      this.bookingConfirmed = this.confirmedAssignments.length === this.participants.length;
    };

    const handleApiFailure = (message: string) => {
      this.refreshAfterAvailabilityConflict(message);
    };

    if (this.bookingService.createOnlineBookingsThroughApi(
      onlineBookings,
      result => result.success ? completeBooking() : handleApiFailure(result.message),
      handleApiFailure
    )) {
      return;
    }

    const bookingResult = this.bookingService.addOnlineBookings(onlineBookings);
    if (!bookingResult.success) {
      handleApiFailure(bookingResult.message);
      return;
    }

    completeBooking();
  }

  private validateBookingBeforeConfirm(): boolean {
    const missingServiceIndex = this.participants.findIndex(person =>
      !person.selectedServices.length && !this.hasHomeCustomService
    );
    if (missingServiceIndex !== -1) {
      this.activeParticipantIndex = missingServiceIndex;
      const person = this.participants[missingServiceIndex];
      return this.showValidationError(`Please select at least one service for ${person.label}.`, 'service-section');
    }

    if (this.serviceLocation === 'salon') {
      const missingBarberIndex = this.participants.findIndex(person => !person.selectedBarber);
      if (missingBarberIndex !== -1) {
        this.activeParticipantIndex = missingBarberIndex;
        const person = this.participants[missingBarberIndex];
        return this.showValidationError(`Please choose a barber for ${person.label}.`, 'barber-section');
      }

      const incompatibleBarberIndex = this.participants.findIndex(person =>
        person.selectedBarber
        && person.selectedBarber !== 'any'
        && !this.barberSupportsPerson(person.selectedBarber, person)
      );

      if (incompatibleBarberIndex !== -1) {
        this.activeParticipantIndex = incompatibleBarberIndex;
        const person = this.participants[incompatibleBarberIndex];
        return this.showValidationError(
          'The selected barber does not provide all services for ' + person.label + '. Please choose another barber.',
          'barber-section'
        );
      }
    }

    if (!this.selectedDate) {
      return this.showValidationError('Please select an appointment date.', 'date-time-section');
    }

    if (this.isDateDisabled(this.selectedDate.date)) {
      return this.showValidationError('This date is not available under the current salon booking settings.', 'date-time-section');
    }

    if (!this.selectedTime || !this.availableTimes.includes(this.selectedTime)) {
      this.clearSelectedTime();
      return this.showValidationError('Please select an available appointment time.', 'date-time-section');
    }

    if (!this.customer.name.trim()) {
      return this.showValidationError('Please enter your full name.', 'customer-details-section', 'customer-name-input');
    }

    if (!this.customer.phone.trim()) {
      this.phoneTouched = true;
      return this.showValidationError('Please enter your Pakistan mobile number.', 'customer-details-section', 'customer-phone-input');
    }

    if (!this.isPakistanPhoneValid) {
      this.phoneTouched = true;
      return this.showValidationError('Please enter a valid Pakistan mobile number, e.g. +92 300 1234567.', 'customer-details-section', 'customer-phone-input');
    }

    if (this.serviceLocation === 'home' && !this.homeAddress.trim()) {
      return this.showValidationError(
        'Please enter the complete address for your home service.',
        'customer-details-section',
        'home-service-address'
      );
    }

    this.bookingValidationMessage = '';
    return true;
  }

  private showValidationError(message: string, sectionId: string, focusId?: string): false {
    this.bookingValidationMessage = message;

    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (focusId) {
        setTimeout(() => document.getElementById(focusId)?.focus(), 450);
      }
    });

    return false;
  }

  canConfirmBooking(): boolean {
    return !!(
      this.allParticipantsReady
      && this.selectedDate
      && !this.isDateDisabled(this.selectedDate.date)
      && this.selectedTime
      && this.availableTimes.includes(this.selectedTime)
      && this.customerDetailsComplete
    );
  }

  get barberName(): string { return this.getPersonBarberName(this.activeParticipant); }

  get barberImage(): string {
    const barber = this.activeParticipant.selectedBarber;
    return !barber || barber === 'any' ? '' : barber.image;
  }

  get barberRating(): number | null {
    const barber = this.activeParticipant.selectedBarber;
    return !barber || barber === 'any' ? null : barber.rating;
  }

  get barberExperience(): string {
    const barber = this.activeParticipant.selectedBarber;
    return !barber || barber === 'any' ? '' : barber.experience;
  }

  get bookingEndTime(): string {
    if (!this.selectedTime) return '';

    if (this.bookingMode === 'group' && this.groupStrategy === 'sequential' && this.sequentialSchedule.length) {
      const last = this.sequentialSchedule[this.sequentialSchedule.length - 1];
      const person = this.participants.find(item => item.id === last.personId);
      return this.minutesToTime(this.timeToMinutes(last.time) + (person ? this.getPersonDuration(person) : 0));
    }

    const duration = Math.max(...this.participants.map(person => this.getPersonDuration(person)));
    return this.minutesToTime(this.timeToMinutes(this.selectedTime) + duration);
  }

  getPersonPrice(person: BookingPerson): number {
    return person.selectedServices.reduce((total, selected) => {
      const current = this.services.find(service => service.id === selected.id);
      return total + (current?.price ?? selected.price);
    }, 0);
  }

  hasServiceDiscount(service: Service): boolean {
    return service.discountPrice !== null
      && service.discountPrice > 0
      && service.discountPrice < service.originalPrice;
  }

  getServiceDiscountPercent(service: Service): number {
    if (!this.hasServiceDiscount(service)) return 0;
    return Math.round(((service.originalPrice - Number(service.discountPrice)) / service.originalPrice) * 100);
  }

  getPersonDuration(person: BookingPerson): number {
    const listedDuration = person.selectedServices.reduce((total, service) => total + service.duration, 0);
    const customDuration = this.hasHomeCustomService ? this.homeCustomServiceDuration : 0;
    return listedDuration + customDuration;
  }

  getPersonBarberName(person: BookingPerson): string {
    if (!person.selectedBarber) return this.serviceLocation === 'home' ? 'Best available barber' : 'Select barber';
    if (person.selectedBarber === 'any') return this.serviceLocation === 'home' ? 'Best available barber' : 'Any available barber';
    return person.selectedBarber.name;
  }

  getPersonBarberImage(person: BookingPerson): string {
    if (!person.selectedBarber || person.selectedBarber === 'any') return '';
    return person.selectedBarber.image;
  }

  closeSuccess(): void {
    this.bookingConfirmed = false;
    this.resetBookingForm();
  }

  private filterServicesByCategory(source: Service[]): Service[] {
    if (this.selectedServiceCategory === 'all') return source;

    const categoryExists = source.some(
      service => service.categoryId === this.selectedServiceCategory
    );

    if (!categoryExists) return source;

    return source.filter(service => service.categoryId === this.selectedServiceCategory);
  }

  private resetBookingForm(): void {
    this.serviceLocation = 'salon';
    this.resetServiceReveal();
    this.selectedServiceCategory = 'all';
    this.homeAddress = '';
    this.specialHomeService = '';
    this.bookingMode = 'single';
    this.groupStrategy = 'parallel';
    this.participants = [this.createPerson(1, 'You')];
    this.activeParticipantIndex = 0;
    this.nextPersonId = 2;
    this.selectedDate = null;
    this.clearSelectedTime();
    this.calendarDate = this.startOfMonth(this.settingsService.salonNow());
    this.customer = { name: '', phone: '', notes: '' };
    this.phoneTouched = false;
    this.bookingValidationMessage = '';
    this.bookingSubmittedStatus = 'Confirmed';
    this.confirmedAssignments = [];
    this.availableTimes = [];
    this.buildCalendar();
  }

  private clearSelectedTime(): void {
    this.selectedTime = null;
    this.sequentialSchedule = [];
  }

  private createPerson(id: number, label: string): BookingPerson {
    return { id, label, selectedServices: [], selectedBarber: null };
  }

  private barberSupportsPerson(barber: Barber, person: BookingPerson): boolean {
    return this.barberService.supportsServices(
      barber.id,
      person.selectedServices.map(service => service.name)
    );
  }

  private ensureCompatibleBarberSelection(): void {
    if (this.bookingMode === 'group' && this.groupStrategy === 'sequential') {
      const selected = this.participants[0]?.selectedBarber;
      if (selected && selected !== 'any' && this.participants.some(person => !this.barberSupportsPerson(selected, person))) {
        this.participants.forEach(person => person.selectedBarber = null);
      }
      return;
    }

    const person = this.activeParticipant;
    if (person.selectedBarber && person.selectedBarber !== 'any' && !this.barberSupportsPerson(person.selectedBarber, person)) {
      person.selectedBarber = null;
    }
  }

  private get businessWindows(): { start: number; end: number }[] {
    const date = this.selectedDate?.date || this.settingsService.salonNow();
    const hours = this.settingsService.hoursForDate(date);
    return hours ? [hours] : [];
  }

  private resolveBarberAssignments(time: string): Map<number, Barber> | null {
    if (!this.selectedDate || this.isDateDisabled(this.selectedDate.date) || !this.allParticipantsReady) return null;

    if (this.bookingMode === 'group' && this.groupStrategy === 'sequential') {
      const schedule = this.buildSequentialSchedule(time);
      if (!schedule) return null;

      this.sequentialSchedule = schedule;
      const assignments = new Map<number, Barber>();
      schedule.forEach(slot => assignments.set(slot.personId, slot.barber));
      return assignments;
    }

    return this.resolveParallelBarbers(time);
  }

  private buildSequentialSchedule(firstTime: string): PersonSchedule[] | null {
    if (!this.selectedDate || !this.participants.length) return null;

    const firstChoice = this.participants[0].selectedBarber;
    if (!firstChoice) return null;
    const candidateBarbers = (firstChoice === 'any' ? this.barbers : [firstChoice])
      .filter(barber => this.participants.every(person => this.barberSupportsPerson(barber, person)));

    for (const barber of candidateBarbers) {
      const schedule: PersonSchedule[] = [];
      let earliestStart = this.timeToMinutes(firstTime);
      let failed = false;

      for (let index = 0; index < this.participants.length; index++) {
        const person = this.participants[index];
        const duration = this.getPersonDuration(person);
        const slot = this.findNextAvailableSlot(barber.id, earliestStart, duration);

        if (slot === null) {
          failed = true;
          break;
        }

        const actualTime = this.minutesToTime(slot);
        schedule.push({
          personId: person.id,
          time: actualTime,
          barber,
          suggested: index > 0 && slot > earliestStart
        });
        earliestStart = slot + duration;
      }

      if (!failed && schedule.length === this.participants.length && schedule[0].time === firstTime) {
        return schedule;
      }
    }

    return null;
  }

  private findNextAvailableSlot(barberId: number, earliestStart: number, duration: number): number | null {
    if (!this.selectedDate) return null;

    for (const window of this.businessWindows) {
      if (earliestStart >= window.end) continue;

      let start = Math.max(earliestStart, window.start);
      const interval = this.settingsService.bookingInterval;
      start = window.start + Math.ceil((start - window.start) / interval) * interval;

      for (let minutes = start; minutes + duration <= window.end; minutes += interval) {
        const time = this.minutesToTime(minutes);
        if (this.isBarberAvailable(barberId, time, this.selectedDate.fullDate, duration)) return minutes;
      }
    }

    return null;
  }

  private resolveParallelBarbers(time: string): Map<number, Barber> | null {
    if (!this.selectedDate) return null;

    const assignments = new Map<number, Barber>();
    const usedBarberIds = new Set<number>();

    for (const person of this.participants) {
      const selected = person.selectedBarber;
      if (!selected || selected === 'any') continue;

      if (usedBarberIds.has(selected.id)) return null;
      if (!this.barberSupportsPerson(selected, person)) return null;
      if (!this.isBarberAvailable(selected.id, time, this.selectedDate.fullDate, this.getPersonDuration(person))) return null;

      assignments.set(person.id, selected);
      usedBarberIds.add(selected.id);
    }

    const choices = this.participants
      .filter(person => person.selectedBarber === 'any')
      .map(person => ({
        person,
        candidates: this.barbers.filter(barber =>
          !usedBarberIds.has(barber.id)
          && this.barberSupportsPerson(barber, person)
          && this.isBarberAvailable(barber.id, time, this.selectedDate!.fullDate, this.getPersonDuration(person))
        ).sort((a, b) => this.compareAutoAssignedBarbers(a, b, this.selectedDate!.fullDate))
      }))
      .sort((a, b) => a.candidates.length - b.candidates.length);

    // Try alternatives when a preferred barber is needed by another participant.
    const assign = (index: number): boolean => {
      if (index === choices.length) return true;
      const { person, candidates } = choices[index];
      for (const barber of candidates) {
        if (usedBarberIds.has(barber.id)) continue;
        assignments.set(person.id, barber);
        usedBarberIds.add(barber.id);
        if (assign(index + 1)) return true;
        assignments.delete(person.id);
        usedBarberIds.delete(barber.id);
      }
      return false;
    };
    if (!assign(0)) return null;

    return assignments.size === this.participants.length ? assignments : null;
  }

  private compareAutoAssignedBarbers(a: Barber, b: Barber, date: string): number {
    if (b.rating !== a.rating) return b.rating - a.rating;

    const aLoad = this.bookingService.all.filter(booking =>
      booking.status !== 'Cancelled' && booking.barber === a.name && booking.date === date
    ).length;
    const bLoad = this.bookingService.all.filter(booking =>
      booking.status !== 'Cancelled' && booking.barber === b.name && booking.date === date
    ).length;

    if (aLoad !== bLoad) return aLoad - bLoad;
    return a.id - b.id;
  }

  private isBarberAvailable(barberId: number, requestedTime: string, date: string, duration: number): boolean {
    if (!this.barberService.isAvailableOnDate(barberId, date)) return false;
    if (!this.barberService.isWorkingAt(barberId, requestedTime, duration)) return false;

    const requestedStart = this.timeToMinutes(requestedTime);
    const requestedEnd = requestedStart + duration;

    // A service must both start and finish inside the configured business hours.
    const insideBusinessHours = this.businessWindows.some(window =>
      requestedStart >= window.start && requestedEnd <= window.end
    );
    if (!insideBusinessHours) return false;

    const barberName = this.barbers.find(barber => barber.id === barberId)?.name;
    const adminBookings = barberName
      ? this.bookingService.all.filter(booking =>
          booking.status !== 'Cancelled'
          && booking.barber === barberName
          && booking.date === date
        )
      : [];

    return !adminBookings.some(booking => {
      const bookingStart = this.timeToMinutes(booking.time);
      const bookingEnd = bookingStart + booking.duration;
      return requestedStart < bookingEnd && requestedEnd > bookingStart;
    });
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private timeToMinutes(time: string): number {
    const [timePart, modifier] = time.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);

    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  private minutesToTime(totalMinutes: number): string {
    let hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const modifier = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, '0')} ${modifier}`;
  }
}
