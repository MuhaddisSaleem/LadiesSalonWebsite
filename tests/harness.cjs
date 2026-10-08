const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// Load actual application methods; Angular's production build covers templates and DI.
function load(file, name, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/app', file), 'utf8')
    .replace(/^import [\s\S]*?;\r?\n/gm, '')
    .replace(/@HostListener\([^\n]*\)\r?\n/g, '')
    .replace(/@Injectable\([^\n]*\)\r?\n/g, '')
    .replace(/@Component\([\s\S]*?\}\)\r?\n/, '');
  let code;
  try {
    const ts = require('typescript');
    code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, useDefineForClassFields: false } }).outputText;
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    code = require('node:module').stripTypeScriptTypes(source.replace(/^export /gm, ''), { mode: 'transform' });
  }
  return vm.runInNewContext(code + '\n' + name, { exports: {}, ...globals });
}
const DAY = '2026-09-28', NEXT = '2026-09-29';
function fixture(seed = {}) {
  let now = new Date(2026, 8, 28, 16, 30);
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } static now() { return now.getTime(); } }
  const values = new Map(Object.entries(seed).map(([k,v]) => [k, JSON.stringify(v)]));
  let blockedKey = '';
  const storage = {
    getItem: k => values.get(k) || null,
    setItem(k,v) { if (blockedKey === '*' || blockedKey === k) throw Error('Quota exceeded'); values.set(k,v); },
    removeItem(k) { values.delete(k); }
  };
  for (const key of ['barbers','services','bookings']) storage.setItem('royal-barbers.admin-' + key + '.demo-cleaned.v1', '1');
  const window = { localStorage: storage, setTimeout: () => 0 };
  class SubjectStub {
    listeners = new Set();
    next(value) { for (const listener of this.listeners) listener(value); }
    subscribe(listener) { this.listeners.add(listener); return { unsubscribe: () => this.listeners.delete(listener) }; }
    asObservable() { return this; }
  }
  const tapStub = handler => source => ({
    subscribe(observer) {
      return source.subscribe({
        next(value) {
          handler(value);
          if (typeof observer === 'function') observer(value);
          else observer?.next?.(value);
        },
        error(error) {
          observer?.error?.(error);
        }
      });
    }
  });
  const globals = {
    Date: Clock,
    window,
    setTimeout: () => 0,
    clearTimeout: () => {},
    Subscription: require('rxjs').Subscription,
    Subject: SubjectStub,
    tap: tapStub,
    document: { getElementById: () => null }
  };
  const make = (file, name, ...deps) => new (load(file, name, globals))(...deps);
  const notifications = [];
  const notify = { add: item => notifications.push(item) };
  const settings = make('admin/settings/admin-settings.service.ts','AdminSettingsService',notify);
  // Scheduling fixtures use a controlled salon wall clock; timezone conversion has its own tests.
  settings.salonNow = () => new Clock();
  const barbers = make('admin/barbers/admin-barber.service.ts','AdminBarberService',notify,undefined,settings);
  const services = make('admin/services/admin-service.service.ts','AdminServiceService',notify,barbers);

  const bookings = make('admin/bookings/admin-booking.service.ts','AdminBookingService',barbers,services,settings,notify);
  const barber = (patch = {}) => {
    const b = { id: barbers.all.length + 1, name: 'Barber ' + (barbers.all.length + 1), phone: '+92 300 1234567', accountStatus: 'Active', availability: 'Available Today', workingHours: '9:00 AM - 9:00 PM', specialties: ['Haircut','Beard'], rating: 5, experience: '5 years', image: 'assets/images/barber-placeholder.svg', ...patch };
    barbers.all.push(b); return b;
  };
  const service = (patch = {}) => {
    const s = { id: services.all.length + 1, name: 'Haircut', categoryId: 1, categoryName: 'Haircut', duration: 40, originalPrice: 600, discountPrice: null, homeServiceEnabled: true, homeOriginalPrice: 900, homeDiscountPrice: null, status: 'Active', image: 'assets/images/service-placeholder.svg', ...patch };
    services.all.push(s); return s;
  };
  const booking = (patch = {}) => {
    const b = { id: bookings.all.length + 1, code: 'RB-test', customerName: 'Test Customer', phone: '+92 300 1234567', barber: 'Barber 1', service: 'Haircut', duration: 40, date: DAY, time: '5:00 PM', amount: 600, status: 'Confirmed', source: 'Online', ...patch };
    bookings.all.push(b); return b;
  };
  const customer = make('booking/booking.component.ts','BookingComponent',barbers,services,settings,bookings);
  const routeParams = new (require('rxjs').BehaviorSubject)(new Map());
  const admin = make('admin/bookings/admin-bookings.component.ts','AdminBookingsComponent',bookings,{ queryParamMap: routeParams },settings);
  const select = (b, s, date = DAY) => {
    customer.setSelectedDate(new Clock(date + 'T12:00:00'));
    customer.participants[0].selectedServices = [customer.services.find(x => x.id === s.id)];
    customer.participants[0].selectedBarber = b === 'any' ? 'any' : customer.barbers.find(x => x.id === b.id);
    customer.generateAvailableTimes();
    admin.walkInSelectedServiceNames = [s.name];
    admin.newBooking = { customerName:'Test Customer',phone:'3001234567',barber:b === 'any' ? '' : b.name,service:s.name,date,time:'',notes:'' };
  };
  return { make, routeParams, Clock, window, storage, values, notifications, barbers, services, settings, bookings, barber, service, booking, customer, admin, select, setNow: date => now = date, fail: key => blockedKey = key };
}
module.exports = { load, fixture, DAY, NEXT };
