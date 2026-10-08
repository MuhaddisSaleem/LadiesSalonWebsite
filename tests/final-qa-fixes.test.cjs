const test = require('node:test');
const assert = require('node:assert/strict');
const { of, throwError, firstValueFrom } = require('rxjs');
const { load, fixture } = require('./harness.cjs');

test('TT-05 deep links react to route reuse, delayed bookings, and unsubscribe on destruction', () => {
  const f = fixture();
  f.routeParams.next(new Map([['booking', '7']]));
  f.admin.ngOnInit();
  assert.equal(f.admin.drawerOpen, false);
  const first = f.booking({ id: 7 });
  f.bookings.bookingsChangedSubject.next();
  assert.equal(f.admin.selectedBooking, first);
  f.admin.drawerOpen = false;
  f.bookings.bookingsChangedSubject.next();
  assert.equal(f.admin.drawerOpen, false, 'refresh must not reopen a dismissed drawer');
  const second = f.booking({ id: 8 });
  f.routeParams.next(new Map([['booking', '8']]));
  assert.equal(f.admin.selectedBooking, second);
  f.admin.ngOnDestroy();
  f.routeParams.next(new Map([['booking', '7']]));
  assert.equal(f.admin.selectedBooking, second);
});

for (const authenticated of [false, true]) test(`TT-06 committed booking succeeds when refresh fails (admin=${authenticated})`, () => {
  const f = fixture();
  f.bookings.api = { getAll: () => throwError(() => Error('offline')), getBusySlots: () => throwError(() => Error('offline')) };
  f.bookings.auth = { isAuthenticated: () => authenticated };
  let successes = 0;
  f.bookings.reloadAfterMutation({ success: true, message: 'Saved' }, result => { assert.equal(result.success, true); successes++; });
  assert.equal(successes, 1);
  assert.equal(f.notifications.length, 1);
});

test('TT-07 repeated walk-in submit sends one request; error unlocks retry', () => {
  const f = fixture(), b = f.barber(), s = f.service();
  f.select(b, s);
  let requests = 0, fail;
  f.bookings.createWalkInThroughApi = (input, ok, error) => { requests++; fail = error; return true; };
  f.admin.createBooking();
  f.admin.createBooking();
  assert.equal(requests, 1);
  assert.equal(f.admin.creatingBooking, true);
  fail('network error');
  assert.equal(f.admin.creatingBooking, false);
  f.admin.createBooking();
  assert.equal(requests, 2);
});

test('TT-07 successful walk-in unlocks and closes the modal', () => {
  const f = fixture(), b = f.barber(), s = f.service(); f.select(b, s);
  f.admin.createModalOpen = true;
  f.bookings.createWalkInThroughApi = (input, ok) => { ok({ success: true, message: 'Saved' }); return true; };
  f.admin.createBooking();
  assert.equal(f.admin.creatingBooking, false);
  assert.equal(f.admin.createModalOpen, false);
});

test('TT-08 comma-containing selected service remains one specialty and one submitted name', () => {
  const f = fixture(), name = 'Cut, wash and style';
  const b = f.barber({ specialties: [name] }), s = f.service({ name });
  f.select(b, s);
  let submitted;
  f.bookings.createWalkInThroughApi = input => { submitted = input; return true; };
  f.admin.createBooking();
  assert.ok(submitted);
  assert.deepEqual(Array.from(submitted.serviceNames), [name]);
  assert.deepEqual(Array.from(f.bookings.bookingServiceNames(submitted)), [name]);
});

test('TT-08 legacy booking string matching a comma-containing catalogue service stays one name', () => {
  const f = fixture(), name = 'Cut, wash and style';
  f.service({ name });
  const legacy = {
    service: name,
    serviceNames: undefined,
    serviceLocation: 'Salon',
    specialService: ''
  };
  assert.deepEqual(Array.from(f.bookings.bookingServiceNames(legacy)), [name]);
});

for (const [zone, instant, expected] of [
  ['Asia/Karachi', '2026-10-05T22:30:00Z', [2026, 10, 6, 3, 30]],
  ['America/New_York', '2026-07-01T03:30:00Z', [2026, 6, 30, 23, 30]],
  ['America/New_York', '2026-12-01T03:30:00Z', [2026, 11, 30, 22, 30]],
  ['invalid-zone', '2026-10-05T22:30:00Z', [2026, 10, 5, 22, 30]]
]) test(`TT-10 salon wall time ${zone} ${instant}`, () => {
  const Settings = load('admin/settings/admin-settings.service.ts', 'AdminSettingsService');
  const value = Settings.prototype.salonNow.call({ current: { timezone: zone } }, new Date(instant));
  assert.deepEqual([value.getFullYear(), value.getMonth() + 1, value.getDate(), value.getHours(), value.getMinutes()], expected);
});

function mediaFixture(http) {
  const signal = value => { const read = () => value; read.set = next => value = next; return read; };
  const Service = load('admin/settings/branding-media.service.ts', 'BrandingMediaService', { signal, firstValueFrom, FormData });
  return new Service(http);
}
test('TT-04 a new browser gets the shared server branding', async () => {
  const service = mediaFixture({ get: () => of([{ key: 'logo', contentType: 'image/png', url: '/api/branding/logo?v=1' }, { key: 'hero', contentType: 'video/mp4', url: '/api/branding/hero?v=2' }]) });
  await service.ready;
  assert.equal(service.logoUrl(), '/api/branding/logo?v=1');
  assert.equal(service.heroMediaType(), 'video');
});
test('TT-04 failed upload/delete retains previously loaded branding', async () => {
  const service = mediaFixture({ get: () => of([{ key: 'logo', contentType: 'image/png', url: '/old' }]), put: () => throwError(() => Error('offline')), delete: () => throwError(() => Error('offline')) });
  await service.ready;
  const result = await service.saveLogo(new File(['content'], 'logo.png', { type: 'image/png' }));
  assert.equal(result.success, false);
  await assert.rejects(() => service.clearLogo());
  assert.equal(service.logoUrl(), '/old');
});
test('TT-04 upload updates URL only after server acknowledgement and rejects active media', async () => {
  let calls = 0;
  const service = mediaFixture({ get: () => of([]), put: () => { calls++; return of({ key: 'logo', contentType: 'image/png', url: '/saved' }); } });
  assert.equal((await service.saveLogo(new File(['svg'], 'x.svg', { type: 'image/svg+xml' }))).success, false);
  assert.equal(calls, 0);
  assert.equal((await service.saveLogo(new File(['png'], 'x.png', { type: 'image/png' }))).success, true);
  assert.equal(service.logoUrl(), '/saved');
});
