const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { fixture, DAY, NEXT } = require('./harness.cjs');
const equal = (a,b) => assert.equal(JSON.stringify(a),JSON.stringify(b));
const syncObservable = (value, error = null) => ({
  pipe(...operators) { return operators.reduce((source, operator) => operator(source), this); },
  subscribe(observer) {
    if (error) observer?.error?.(error);
    else if (typeof observer === 'function') observer(value);
    else observer?.next?.(value);
    return { unsubscribe() {} };
  }
});
const apiCustomer = (id, name, phone, bookings, nextBooking = null, notes = '') => ({
  id,
  name,
  phone,
  email: '',
  bookingCount: bookings.filter(item => item.status !== 'Cancelled').length,
  completedVisits: bookings.filter(item => item.status === 'Completed').length,
  cancelledCount: bookings.filter(item => item.status === 'Cancelled').length,
  totalSpend: bookings.filter(item => item.status === 'Completed').reduce((sum, item) => sum + item.amount, 0),
  lastVisit: null,
  nextBooking,
  customerType: bookings.filter(item => item.status !== 'Cancelled').length > 1 ? 'Returning' : 'New',
  firstBookingDate: bookings[0]?.date || '',
  lastBookingDate: bookings.at(-1)?.date || '',
  notes,
  bookings
});

test('dashboard and reports stay read-only and cannot mutate booking state', () => {
  for (const file of [
    'backend/BarberFlow.Api/Services/DashboardApplicationService.cs',
    'backend/BarberFlow.Api/Services/ReportsApplicationService.cs'
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /AsNoTracking\(\)/, file + ' should query read-only data');
    assert.doesNotMatch(source, /SaveChanges(?:Async)?\s*\(/, file + ' must not write through DbContext');
    assert.doesNotMatch(source, /db\.(?:Add|AddRange|Remove|RemoveRange|Update|UpdateRange)\s*\(/, file + ' must remain projection-only');
  }

  for (const file of [
    'backend/BarberFlow.Api/Controllers/DashboardController.cs',
    'backend/BarberFlow.Api/Controllers/ReportsController.cs'
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /\[HttpGet/, file + ' should expose GET only');
    assert.doesNotMatch(source, /\[Http(?:Post|Put|Patch|Delete)/, file + ' must not expose booking mutations');
  }
});

test('settings business-hour saves protect active bookings and deferred messaging stays off by default', () => {
  const source = fs.readFileSync('backend/BarberFlow.Api/Services/CatalogApplicationService.cs', 'utf8');
  assert.match(source, /ValidateBusinessHoursAgainstActiveBookingsAsync/);
  assert.match(source, /BookingStatus\.Pending/);
  assert.match(source, /BookingStatus\.Confirmed/);
  assert.match(source, /Reschedule or cancel that booking first/);

  const entity = fs.readFileSync('backend/BarberFlow.Api/Domain/Entities/Salon.cs', 'utf8');
  assert.doesNotMatch(entity, /SendWhatsappConfirmation\s*\{[^}]*\}\s*=\s*true/);
  assert.doesNotMatch(entity, /SendAppointmentReminder\s*\{[^}]*\}\s*=\s*true/);
});

test('settings reject unsafe limits and duplicate weekdays before persistence', () => {
  const f = fixture();
  const base = {
    ...f.settings.current,
    businessName: 'QA Salon',
    businessPhone: '+92 300 1234567',
    whatsappNumber: '+92 300 1234567'
  };

  assert.equal(f.settings.save({...base,maxAdvanceDays:366}).success,false);
  assert.equal(f.settings.save({...base,cancellationHours:169}).success,false);
  assert.equal(f.settings.save({...base,lateArrivalMinutes:241}).success,false);

  const duplicateHours = base.businessHours.map(day=>({...day}));
  duplicateHours[1].key = duplicateHours[0].key;
  assert.equal(f.settings.save({...base,businessHours:duplicateHours}).success,false);
});

for (const hours of ['9:00 AM - 9:00 PM','9 AM - 9 PM','09:00 - 21:00','9am to 9pm','9:00AM – 9:00PM','9:00 a.m. — 9:00 p.m.','']) {
  test('legacy working hours allow matching customer/admin slots: ' + (hours || '(salon hours)'), () => {
    const f = fixture(), b = f.barber({workingHours:hours}), s = f.service();f.select(b,s);
    assert.ok(f.customer.availableTimes.includes('5:00 PM'));
    equal(f.customer.availableTimes,f.admin.createTimeSlots);
  });
}
for (const hours of ['nonsense','...','9..AM - 9..PM','25:00 - 26:00','9:75 AM - 9:00 PM','9 PM - 9 AM','9:00 AM - 9:00 AM']) {
  test('invalid or reversed hours never enable appointments: ' + hours, () => {
    const f=fixture(), b=f.barber({workingHours:hours}),s=f.service(); f.select(b,s);
    assert.equal(f.customer.availableTimes.length,0);
    assert.equal(f.admin.createTimeSlots.length,0);
  });
}
test('empty legacy hours inherit salon closing time, not unrestricted booking', () => {
  const f=fixture(),b=f.barber({workingHours:''}),s=f.service();f.select(b,s);
  assert.equal(f.customer.availableTimes.includes('8:30 PM'),false);
  assert.equal(f.bookings.addBooking({customerName:'C',phone:'+92 300 1234567',barber:b.name,service:s.name,duration:40,date:DAY,time:'9:00 PM',amount:600}).success,false);
});
test('closed weekdays, same-day disabled, past and advance dates remain disabled', () => {
  const f=fixture(),b=f.barber(),s=f.service();
  f.settings.settings.businessHours[0].enabled=false; f.select(b,s);assert.equal(f.customer.availableTimes.length,0);
  f.settings.settings.businessHours[0].enabled=true;f.settings.settings.allowSameDayBooking=false;f.select(b,s);assert.equal(f.customer.availableTimes.length,0);
  f.admin.openCreateModal(); assert.equal(f.admin.newBooking.date,DAY);
  f.select(b,s,'2026-09-27');assert.equal(f.customer.availableTimes.length,0);
  f.select(b,s,'2026-11-30');assert.equal(f.customer.availableTimes.length,0);
  f.select(b,s,NEXT);assert.ok(f.customer.availableTimes.length>0);
});
test('leave, inactive status and unsupported specialties correctly block selected barbers', () => {
  const f=fixture(),b=f.barber(),s=f.service();
  for (const patch of [{accountStatus:'Inactive'}, {accountStatus:'Active',availability:'Not Available Today'}, {availability:'On Leave',leaveFrom:DAY,leaveTo:NEXT},{availability:'Available Today',specialties:['Beard']}]) {
    Object.assign(b,patch); f.customer.participants[0].selectedServices=[f.customer.services[0]];
    f.customer.participants[0].selectedBarber={id:b.id,name:b.name};f.customer.setSelectedDate(new f.Clock(DAY+'T12:00:00'));f.customer.generateAvailableTimes();assert.equal(f.customer.availableTimes.length,0);
  }
});
test('full duration, overlaps, cancellation and touching boundaries agree in both forms', () => {
  const f=fixture(),b=f.barber(),s=f.service();const ap=f.booking({time:'5:00 PM',duration:40});f.select(b,s);
  assert.equal(f.customer.availableTimes.includes('5:00 PM'),false);assert.equal(f.customer.availableTimes.includes('5:30 PM'),false);assert.equal(f.customer.availableTimes.includes('6:00 PM'),true);
  equal(f.customer.availableTimes,f.admin.createTimeSlots);
  assert.equal(f.bookings.isBarberSlotAvailable(b.name,DAY,'5:40 PM',40),true);
  f.bookings.cancel(ap.id);f.customer.generateAvailableTimes();assert.equal(f.customer.availableTimes.includes('5:00 PM'),true);
});
test('parallel Any Barber assignments find an available specialist instead of failing greedily', () => {
  const f=fixture(),a=f.barber({specialties:['Haircut','Beard'],rating:5}),b=f.barber({specialties:['Haircut'],rating:4});
  f.service();f.service({name:'Beard'});f.customer.setSelectedDate(new f.Clock(DAY+'T12:00:00'));
  f.customer.setBookingMode('group');
  f.customer.participants.forEach((p,i)=>{p.selectedServices=[f.customer.services[i]];p.selectedBarber='any';});f.customer.generateAvailableTimes();
  assert.ok(f.customer.availableTimes.includes('5:00 PM'));
  const assignments=f.customer.resolveParallelBarbers('5:00 PM');assert.equal(assignments.get(1).id,b.id);assert.equal(assignments.get(2).id,a.id);
});
test('parallel fixed choices cannot double-book the same barber', () => {
  const f=fixture(),b=f.barber(),s=f.service();f.select(b,s);f.customer.setBookingMode('group');f.customer.participants.forEach(p=>{p.selectedServices=[f.customer.services[0]];p.selectedBarber=f.customer.barbers[0];});f.customer.generateAvailableTimes();assert.equal(f.customer.availableTimes.length,0);
});
test('sequential group slots use the salon opening-time grid', () => {
  const f=fixture(),b=f.barber(),s=f.service({duration:20});f.settings.settings.businessHours[0].open='09:15';f.select(b,s);
  f.customer.setBookingMode('group');f.customer.setGroupStrategy('sequential');f.customer.participants.forEach(p=>{p.selectedServices=[f.customer.services[0]];p.selectedBarber=f.customer.barbers[0];});f.customer.generateAvailableTimes();
  assert.ok(f.customer.availableTimes.includes('4:45 PM'));
  const schedule=f.customer.buildSequentialSchedule('4:45 PM');equal(schedule.map(x=>x.time),['4:45 PM','5:15 PM']);
});
test('calendar next available agrees with the public slot grid for offset opening times', () => {
  const f=fixture(),b=f.barber(),s=f.service({duration:30});f.settings.settings.businessHours[0].open='09:15';f.select(b,s);
  const calendar=f.make('admin/calendar/admin-calendar.component.ts','AdminCalendarComponent',f.bookings,f.settings,f.barbers,{});
  assert.equal(calendar.barberSummaries[0].nextAvailable,'04:45 PM');
});
test('admin reschedule previews saved barber, not an unsaved assignment', () => {
  const f=fixture(),a=f.barber(),b=f.barber(),s=f.service();const ap=f.booking({time:'6:00 PM'});f.booking({barber:b.name,time:'5:00 PM'});f.admin.openBooking(ap);f.admin.editBarber=b.name;
  assert.equal(f.admin.editTimeSlots.includes('5:00 PM'),true);
});
test('legacy weekday settings retain closed state and hours', () => {
  const f=fixture({'royal-barbers.admin-settings.v1':{businessHours:[{enabled:false,open:'10:00',close:'17:00'},{enabled:true,open:'10:15',close:'18:00'}]}});
  assert.equal(f.settings.hoursForDate(new f.Clock(DAY+'T12:00:00')),null);
  equal(f.settings.hoursForDate(new f.Clock(NEXT+'T12:00:00')),{start:615,end:1080});
});
test('out-of-order keyed settings do not change weekday meaning', () => {
  const f=fixture({'royal-barbers.admin-settings.v1':{businessHours:[{key:'tuesday',enabled:false},{key:'monday',enabled:true,open:'10:15',close:'18:00'}]}});
  equal(f.settings.hoursForDate(new f.Clock(DAY+'T12:00:00')),{start:615,end:1080});assert.equal(f.settings.hoursForDate(new f.Clock(NEXT+'T12:00:00')),null);
});
test('legacy invalid slot intervals use a valid fallback', () => {
  for (const bookingInterval of [5.5,'broken',-1,Infinity]) {const f=fixture({'royal-barbers.admin-settings.v1':{bookingInterval}});assert.equal(f.settings.bookingInterval,30);}
});
test('switching salon/home modes retains only eligible services and correct prices', () => {
  const f=fixture(),b=f.barber(),s=f.service();f.select(b,s);f.customer.setServiceLocation('home');assert.equal(f.customer.totalPrice,900);assert.equal(f.customer.selectedBarber,'any');
  f.customer.homeAddress='Address';f.customer.specialHomeService='Request';f.customer.setServiceLocation('salon');assert.equal(f.customer.totalPrice,600);assert.equal(f.customer.homeAddress,'');assert.equal(f.customer.specialHomeService,'');assert.equal(f.customer.selectedBarber,null);
});
test('custom home requests stay pending until priced, then can confirm', () => {
  const f=fixture();f.barber();
  const result=f.bookings.addOnlineBookings([{customerName:'C',phone:'+92 300 1234567',barber:'Barber 1',date:DAY,time:'5:00 PM',duration:60,amount:0,service:'Custom Home Service',serviceLocation:'Home',specialService:'Custom request',serviceAddress:'Address'}]);assert.equal(result.success,true);
  const b=f.bookings.all[0];assert.equal(b.status,'Pending');assert.equal(f.bookings.updateStatus(b.id,'Confirmed').success,false);
  assert.equal(f.bookings.updateSpecialServiceAmount(b.id,500).success,true);assert.equal(f.bookings.updateStatus(b.id,'Confirmed').success,true);
});
test('closed bookings cannot be repriced or reopened and tiny prices are rejected', () => {
  const f=fixture(),b=f.booking({status:'Completed',serviceLocation:'Home',specialService:'Request',specialServiceAmount:500});
  assert.equal(f.bookings.updateSpecialServiceAmount(b.id,100).success,false);assert.equal(f.bookings.updateStatus(b.id,'Pending').success,false);
  const p=f.booking({status:'Pending',serviceLocation:'Home',specialService:'Request'});assert.equal(f.bookings.updateSpecialServiceAmount(p.id,.1).success,false);
});
test('calendar weekly filter applies the same status selection as daily view', () => {
  const f=fixture();f.booking();f.booking({status:'Pending'});const c=f.make('admin/calendar/admin-calendar.component.ts','AdminCalendarComponent',f.bookings,f.settings,f.barbers,{});c.selectedStatus='Pending';assert.equal(c.dailyBookings.length,1);assert.equal(c.bookingsForDate(new f.Clock()).length,1);
});
test('settings save/reset failures keep the previous in-memory state', () => {
  const f=fixture();const old=JSON.stringify(f.settings.current);f.fail('royal-barbers.admin-settings.v1');const next={...f.settings.current,businessName:'Shop',businessPhone:'+923001234567',whatsappNumber:'+923001234567'};assert.equal(f.settings.save(next).success,false);assert.equal(JSON.stringify(f.settings.current),old);assert.equal(f.settings.reset().success,false);assert.equal(JSON.stringify(f.settings.current),old);
});
test('service rename keeps eligible barber specialties synchronized', () => {
  const f=fixture(),b=f.barber(),s=f.service();assert.equal(f.services.updateService(s.id,{...s,name:'Hair Cut'}).success,true);assert.equal(f.barbers.supportsServices(b.id,['Hair Cut']),true);assert.equal(f.barbers.supportsServices(b.id,['Haircut']),false);
});
test('failed specialty persistence rolls back a service rename', () => {
  const f=fixture(),b=f.barber(),s=f.service();f.fail('royal-barbers.admin-barbers.v1');assert.equal(f.services.updateService(s.id,{...s,name:'Hair Cut'}).success,false);assert.equal(s.name,'Haircut');assert.equal(f.barbers.supportsServices(b.id,['Haircut']),true);
});
test('failed booking writes and conflicting groups never partly save', () => {
  const f=fixture();f.barber();const input={customerName:'C',phone:'+92 300 1234567',barber:'Barber 1',date:DAY,time:'5:00 PM',duration:40,amount:600,service:'Haircut'};assert.equal(f.bookings.addOnlineBookings([input,input]).success,false);assert.equal(f.bookings.all.length,0);f.fail('royal-barbers.admin-bookings.v1');assert.equal(f.bookings.addOnlineBookings([input]).success,false);assert.equal(f.bookings.all.length,0);
});
test('invalid calendar dates and 12-hour times cannot roll into valid bookings', () => {
  const f=fixture();f.barber();for (const patch of [{date:'2026-09-31'}, {time:'0:30 PM'}, {time:'13:00 PM'},{time:'5:65 PM'}]) {assert.equal(f.bookings.addBooking({customerName:'C',phone:'+92 300 1234567',barber:'Barber 1',date:DAY,time:'5:00 PM',duration:40,amount:600,service:'Haircut',...patch}).success,false);}
});

test('walk-ins start at the current time without a time selection', () => {
  const f=fixture(),b=f.barber(),s=f.service();f.settings.settings.allowSameDayBooking=false;
  f.admin.openCreateModal();f.admin.newBooking.customerName='Walk In';f.admin.walkInSelectedServiceNames=[s.name];f.admin.newBooking.service=s.name;f.admin.onCreateServiceOrDateChange();
  assert.equal(f.admin.currentWalkInTime,'4:30 PM');equal(f.admin.createBarbers,[b.name]);assert.equal(f.admin.walkInBarberOptions[0].availableNow,true);
  f.admin.newBooking.barber=b.name;f.admin.createBooking();
  assert.equal(f.bookings.all.length,1);assert.equal(f.bookings.all[0].source,'Walk-in');assert.equal(f.bookings.all[0].status,'Confirmed');assert.equal(f.bookings.all[0].phone,'');assert.equal(f.bookings.all[0].barber,b.name);assert.equal(f.bookings.all[0].time,'4:30 PM');assert.equal(f.bookings.all[0].notes,'');
});

test('walk-in service selection carries correct duration and amount', () => {
  const f=fixture(),b=f.barber(),s=f.service({name:'Haircut',duration:40,originalPrice:600});
  f.admin.openCreateModal();f.admin.newBooking.customerName='Walk In';f.admin.walkInSelectedServiceNames=[s.name];f.admin.newBooking.service=s.name;f.admin.onCreateServiceOrDateChange();
  assert.equal(f.admin.walkInDuration,40);assert.equal(f.admin.walkInAmount,600);
  f.admin.newBooking.barber=b.name;f.admin.createBooking();
  const created=f.bookings.all[0];assert.equal(created.service,'Haircut');assert.equal(created.duration,40);assert.equal(created.amount,600);assert.equal(created.time,'4:30 PM');
});

test('walk-in barber select prefers barbers available now over short-wait barbers', () => {
  const f=fixture(),busy=f.barber({specialties:['Haircut']}),free=f.barber({specialties:['Haircut']}),beard=f.barber({specialties:['Beard']}),s=f.service({name:'Haircut',duration:40});
  f.booking({barber:busy.name,time:'4:00 PM',duration:35});f.admin.openCreateModal();f.admin.walkInSelectedServiceNames=[s.name];f.admin.newBooking.service=s.name;f.admin.onCreateServiceOrDateChange();
  equal(f.admin.createBarbers,[free.name]);assert.equal(f.admin.createBarbers.includes(busy.name),false);assert.equal(f.admin.createBarbers.includes(beard.name),false);
});

test('when all eligible barbers are busy, walk-in suggests the shortest wait within ten minutes', () => {
  const f=fixture(),tenMin=f.barber(),tooLong=f.barber(),s=f.service({duration:20});
  f.booking({barber:tenMin.name,time:'4:00 PM',duration:40});
  f.booking({barber:tooLong.name,time:'4:00 PM',duration:41});
  f.admin.openCreateModal();f.admin.newBooking.customerName='Waiting Customer';f.admin.walkInSelectedServiceNames=[s.name];f.admin.newBooking.service=s.name;f.admin.onCreateServiceOrDateChange();
  equal(f.admin.createBarbers,[tenMin.name]);
  assert.equal(f.admin.walkInBarberOptions[0].waitMinutes,10);assert.equal(f.admin.walkInBarberOptions[0].startTime,'4:40 PM');assert.equal(f.admin.walkInBarberOptions[0].availableNow,false);
  f.admin.newBooking.barber=tenMin.name;f.admin.onCreateBarberChange();assert.equal(f.admin.newBooking.time,'4:40 PM');f.admin.createBooking();
  assert.equal(f.bookings.all[0].barber,tenMin.name);assert.equal(f.bookings.all[0].time,'4:40 PM');
});

test('walk-in remains bookable when the next eligible barber is more than ten minutes away', () => {
  const f=fixture(),b=f.barber(),s=f.service({duration:20});
  f.booking({barber:b.name,time:'4:00 PM',duration:41});
  f.admin.openCreateModal();f.admin.newBooking.customerName='Long Wait Customer';f.admin.walkInSelectedServiceNames=[s.name];f.admin.newBooking.service=s.name;f.admin.onCreateServiceOrDateChange();
  equal(f.admin.createBarbers,[b.name]);assert.equal(f.admin.walkInBarberOptions[0].waitMinutes,11);assert.equal(f.admin.walkInBarberOptions[0].startTime,'4:41 PM');
  f.admin.newBooking.barber=b.name;f.admin.onCreateBarberChange();f.admin.createBooking();
  assert.equal(f.bookings.all[0].barber,b.name);assert.equal(f.bookings.all[0].time,'4:41 PM');
});

test('walk-in only becomes unavailable when no eligible barber has time left today', () => {
  const f=fixture(),b=f.barber(),s=f.service({duration:20});
  f.booking({barber:b.name,time:'4:00 PM',duration:300});
  f.admin.openCreateModal();f.admin.walkInSelectedServiceNames=[s.name];f.admin.newBooking.service=s.name;f.admin.onCreateServiceOrDateChange();
  assert.equal(f.admin.walkInBarberOptions.length,0);assert.equal(f.admin.createBarbers.length,0);
});

test('walk-in barber select respects current working hours and leave', () => {
  const f=fixture(),working=f.barber(),offShift=f.barber({workingHours:'9:00 AM - 4:00 PM'}),onLeave=f.barber({availability:'On Leave',leaveFrom:DAY,leaveTo:DAY}),s=f.service();
  f.admin.openCreateModal();f.admin.walkInSelectedServiceNames=[s.name];f.admin.newBooking.service=s.name;f.admin.onCreateServiceOrDateChange();
  equal(f.admin.createBarbers,[working.name]);assert.equal(f.admin.createBarbers.includes(offShift.name),false);assert.equal(f.admin.createBarbers.includes(onLeave.name),false);
});

test('walk-ins still obey closed days, barber leave and overlap protection', () => {
  const f=fixture(),b=f.barber(),s=f.service();const input={customerName:'Walk In',phone:'',barber:b.name,date:DAY,time:'4:30 PM',duration:s.duration,amount:s.originalPrice,service:s.name,serviceLocation:'Salon'};
  f.settings.settings.businessHours[0].enabled=false;assert.equal(f.bookings.addWalkInBooking(input).success,false);
  f.settings.settings.businessHours[0].enabled=true;b.availability='On Leave';b.leaveFrom=DAY;b.leaveTo=DAY;assert.equal(f.bookings.addWalkInBooking(input).success,false);
  b.availability='Available Today';f.booking();assert.equal(f.bookings.addWalkInBooking(input).success,false);
});

test('phone-less walk-ins stay separate in customer history', () => {
  const f=fixture();
  const one=f.booking({id:1,source:'Walk-in',phone:'',customerName:'Guest One'});
  const two=f.booking({id:2,source:'Walk-in',phone:'',customerName:'Guest Two',time:'6:00 PM'});
  const api={getAll:()=>syncObservable([
    apiCustomer('walkin-1','Guest One','',[one],one),
    apiCustomer('walkin-2','Guest Two','',[two],two)
  ])};
  const customers=f.make('admin/customers/admin-customer.service.ts','AdminCustomerService',api,f.bookings);
  assert.equal(customers.all.length,2);assert.notEqual(customers.all[0].id,customers.all[1].id);
  assert.equal(customers.bookingsForCustomer(customers.all[0]).length,1);
});


for (const autoConfirmBookings of [true,false]) test('customer confirmation persists correct status and ignores duplicate submit: '+autoConfirmBookings,()=>{
  const f=fixture(),b=f.barber(),s=f.service();f.settings.settings.autoConfirmBookings=autoConfirmBookings;f.select(b,s);f.customer.selectTime('5:00 PM');f.customer.customer={name:'Customer',phone:'3001234567',notes:''};f.customer.confirmBooking();
  assert.equal(f.customer.bookingConfirmed,true);assert.equal(f.bookings.all.length,1);assert.equal(f.bookings.all[0].status,autoConfirmBookings?'Confirmed':'Pending');f.customer.confirmBooking();assert.equal(f.bookings.all.length,1);
});
test('cancelling a customer booking releases its slot in the same session',()=>{
  const f=fixture(),b=f.barber(),s=f.service();f.select(b,s);f.customer.selectTime('5:00 PM');f.customer.customer={name:'Customer',phone:'3001234567',notes:''};f.customer.confirmBooking();
  assert.equal(f.bookings.all.length,1);f.bookings.cancel(f.bookings.all[0].id);f.customer.resetBookingForm();f.select(b,s);assert.ok(f.customer.availableTimes.includes('5:00 PM'));
});
test('last-minute conflicts and failed writes do not show customer success',()=>{
  for(const fail of [false,true]) {const f=fixture(),b=f.barber(),s=f.service();f.select(b,s);f.customer.selectTime('5:00 PM');f.customer.customer={name:'Customer',phone:'3001234567',notes:''};if(fail)f.fail('royal-barbers.admin-bookings.v1');else f.booking();f.customer.confirmBooking();assert.equal(f.customer.bookingConfirmed,false);assert.equal(f.bookings.all.length,fail?0:1);}
});
test('admin separate assignment and reschedule actions preserve the saved choice',()=>{
  const f=fixture(),a=f.barber(),b=f.barber(),s=f.service();const ap=f.booking();f.admin.openBooking(ap);f.admin.editBarber=b.name;f.admin.onEditBarberChange();f.admin.editTime='6:00 PM';f.admin.saveSchedule();assert.equal(ap.barber,a.name);assert.equal(ap.time,'6:00 PM');f.admin.saveBarber();assert.equal(ap.barber,b.name);
});
for(const status of ['Completed','Cancelled'])test('closed bookings block reschedule/reassign/status mutations: '+status,()=>{
  const f=fixture(),a=f.barber(),b=f.barber(),s=f.service(),ap=f.booking({status});assert.equal(f.bookings.reschedule(ap.id,NEXT,'5:00 PM').success,false);assert.equal(f.bookings.assignBarber(ap.id,b.name).success,false);assert.equal(f.bookings.updateStatus(ap.id,'Confirmed').success,false);
});
test('walk-in barber options stay empty until a service is selected',()=>{const f=fixture();f.barber();const s=f.service();f.admin.openCreateModal();assert.equal(f.admin.createBarbers.length,0);f.admin.walkInSelectedServiceNames=[s.name];f.admin.newBooking.service=s.name;f.admin.onCreateServiceOrDateChange();assert.ok(f.admin.createBarbers.length>0);});
test('changing walk-in service clears the selected barber and refreshes the current start time',()=>{const f=fixture(),b=f.barber({specialties:['Haircut','Beard']});f.service({name:'Haircut'});f.service({name:'Beard'});f.admin.openCreateModal();f.admin.newBooking.service='Haircut';f.admin.newBooking.barber=b.name;f.admin.newBooking.time='5:00 PM';f.admin.walkInSelectedServiceNames=['Beard'];f.admin.newBooking.service='Beard';f.admin.onCreateServiceOrDateChange();assert.equal(f.admin.newBooking.time,'4:30 PM');assert.equal(f.admin.newBooking.barber,'');});
test('legacy labeled weekday arrays retain their identities',()=>{const f=fixture({'royal-barbers.admin-settings.v1':{businessHours:[{label:'Tuesday',enabled:false},{label:'Monday',enabled:true,open:'10:15',close:'18:00'}]}});equal(f.settings.hoursForDate(new f.Clock(DAY+'T12:00:00')),{start:615,end:1080});assert.equal(f.settings.hoursForDate(new f.Clock(NEXT+'T12:00:00')),null);});
test('barber edits preserve upcoming shifts and identity while services stay automatic',()=>{
  const f=fixture(),b=f.barber(),s=f.service();f.booking();const c=f.make('admin/barbers/admin-barbers.component.ts','AdminBarbersComponent',f.barbers,f.services,f.bookings);
  for(const patch of [{workingHours:'9 AM - 5 PM'},{name:'Renamed'}]) {c.openEditModal(b);Object.assign(c.editBarber,patch);c.saveBarberChanges();assert.equal(c.feedbackType,'error');assert.equal(b.name,'Barber 1');assert.equal(b.workingHours,'9:00 AM - 9:00 PM');}
  c.openEditModal(b);c.editBarber.specialties=['Beard'];c.saveBarberChanges();assert.equal(c.feedbackType,'success');assert.equal(JSON.stringify(b.specialties),JSON.stringify([s.name]));
  c.openEditModal(b);c.editBarber.workingHours='09:00 - 21:00';c.saveBarberChanges();assert.equal(c.feedbackType,'success');assert.equal(b.workingHours,'09:00 - 21:00');
});
test('barber availability, leave, deletion and deactivation protect active appointments',()=>{
  const f=fixture(),b=f.barber();f.service();const ap=f.booking();const c=f.make('admin/barbers/admin-barbers.component.ts','AdminBarbersComponent',f.barbers,f.services,f.bookings);
  c.onAvailabilityChange(b,'Not Available Today');assert.equal(b.availability,'Available Today');c.toggleAccountStatus(b);assert.equal(b.accountStatus,'Active');c.requestDelete(b);assert.equal(c.deleteModalOpen,false);c.openLeaveModal(b,'On Leave');c.leaveForm.from=DAY;c.leaveForm.to=NEXT;c.saveLeave();assert.equal(b.availability,'Available Today');
  f.bookings.cancel(ap.id);c.onAvailabilityChange(b,'Not Available Today');assert.equal(b.availability,'Not Available Today');c.markAvailableToday(b);assert.equal(b.availability,'Available Today');
});
test('custom-only home bookings do not require a fictional barber specialty',()=>{const f=fixture(),b=f.barber();f.booking({service:'Custom Home Service',serviceLocation:'Home',specialService:'Request'});const c=f.make('admin/barbers/admin-barbers.component.ts','AdminBarbersComponent',f.barbers,f.services,f.bookings);c.openEditModal(b);c.saveBarberChanges();assert.equal(c.feedbackType,'success');});
test('service rename/delete guards preserve upcoming bookings',()=>{const f=fixture(),b=f.barber(),s=f.service();f.booking();const c=f.make('admin/services/admin-services.component.ts','AdminServicesComponent',f.services,f.bookings);c.requestDelete(s);assert.equal(c.deleteModalOpen,false);c.openEditModal(s);c.editService.name='Changed';c.saveService();assert.equal(c.feedbackType,'error');assert.equal(s.name,'Haircut');});
test('duplicate barber identities remain blocked',()=>{const f=fixture(),b=f.barber(),other=f.barber();assert.equal(f.barbers.updateBarber(other.id,{...other,name:' barber 1 '}).success,false);assert.equal(other.name,'Barber 2');});
test('customer next appointment excludes elapsed, completed and cancelled records',()=>{
  const f=fixture();
  const past=f.booking({time:'3:00 PM'});
  const completed=f.booking({time:'4:00 PM',status:'Completed'});
  const cancelled=f.booking({time:'4:30 PM',status:'Cancelled'});
  const next=f.booking({time:'5:00 PM'});
  const history=[past,completed,cancelled,next];
  const api={getAll:()=>syncObservable([apiCustomer('customer-1','Test Customer','+92 300 1234567',history,next)])};
  const c=f.make('admin/customers/admin-customer.service.ts','AdminCustomerService',api,f.bookings);
  assert.equal(c.all[0].nextBooking.id,next.id);
});
test('failed customer note persistence reports failure and retains saved note',()=>{
  const f=fixture();
  const booking=f.booking();
  let saved=apiCustomer('customer-1','Test Customer','+92 300 1234567',[booking],booking,'');
  let failSave=false;
  const api={
    getAll:()=>syncObservable([saved]),
    saveNote:(id,notes)=>{
      if(failSave) return syncObservable(null,new Error('Save failed'));
      saved={...saved,notes};
      return syncObservable({success:true,message:'Saved.',customer:saved});
    }
  };
  const c=f.make('admin/customers/admin-customer.service.ts','AdminCustomerService',api,f.bookings);
  let firstSaved=false;
  c.saveNote(saved.id,'Before').subscribe({next:result=>{firstSaved=result.success;}});
  assert.equal(firstSaved,true);
  failSave=true;
  let failed=false;
  c.saveNote(saved.id,'After').subscribe({error:()=>{failed=true;}});
  assert.equal(failed,true);
  assert.equal(c.all[0].notes,'Before');
});
test('historical multi-service bookings remain discoverable by individual service',()=>{const f=fixture();f.booking({service:'Retired Cut, Beard',barber:'Former Barber'});f.admin.selectedService='Beard';assert.equal(f.admin.bookings.length,1);assert.ok(f.admin.filterServices.includes('Retired Cut'));assert.ok(f.admin.filterBarbers.includes('Former Barber'));});
test('calendar does not advertise slots on a disallowed booking date',()=>{const f=fixture();f.barber();f.settings.settings.allowSameDayBooking=false;const c=f.make('admin/calendar/admin-calendar.component.ts','AdminCalendarComponent',f.bookings,f.settings,f.barbers,{});assert.equal(c.barberSummaries[0].nextAvailable,'Booking unavailable');});

test('an open booking tab reloads edited barber hours from admin storage', () => {
  const f = fixture(), b = f.barber({ workingHours: '9 AM - 5 PM' }), s = f.service();
  f.storage.setItem('royal-barbers.admin-services.v1', JSON.stringify(f.services.all));
  f.storage.setItem('royal-barbers.admin-barbers.v1', JSON.stringify(f.barbers.all));
  f.select(b, s);
  assert.equal(f.customer.availableTimes.length, 0);
  // An admin tab saves a longer shift; the already-open customer tab still has the old record.
  f.storage.setItem('royal-barbers.admin-barbers.v1', JSON.stringify([{ ...b, workingHours: '9 AM - 9 PM' }]));
  f.customer.generateAvailableTimes();
  assert.equal(f.customer.availableTimes.length, 0);
  f.customer.refreshAvailability({ key: 'royal-barbers.admin-barbers.v1', storageArea: f.storage });
  assert.ok(f.customer.availableTimes.includes('5:00 PM'));
});
test('storage refresh clears a time booked by another tab and restores it after cancellation', () => {
  const f = fixture(), b = f.barber(), s = f.service();
  f.storage.setItem('royal-barbers.admin-services.v1', JSON.stringify(f.services.all));
  f.storage.setItem('royal-barbers.admin-barbers.v1', JSON.stringify(f.barbers.all));
  f.select(b, s); f.customer.selectTime('5:00 PM');
  const ap = f.booking();
  f.storage.setItem('royal-barbers.admin-bookings.v1', JSON.stringify([ap]));
  f.customer.refreshAvailability({ key: 'royal-barbers.admin-bookings.v1', storageArea: f.storage });
  assert.equal(f.customer.selectedTime, null);
  assert.equal(f.customer.availableTimes.includes('5:00 PM'), false);
  f.storage.setItem('royal-barbers.admin-bookings.v1', JSON.stringify([{ ...ap, status: 'Cancelled' }]));
  f.customer.refreshAvailability();
  assert.ok(f.customer.availableTimes.includes('5:00 PM'));
});
test('unrelated storage events leave the booking selection intact', () => {
  const f = fixture(), b = f.barber(), s = f.service(); f.select(b, s); f.customer.selectTime('5:00 PM');
  f.customer.refreshAvailability({ key: 'royal-barbers.notifications.v1', storageArea: f.storage });
  assert.equal(f.customer.selectedTime, '5:00 PM');
});
test('empty availability explains invalid shifts, insufficient remaining time and overlaps separately', () => {
  const f = fixture(), b = f.barber({ workingHours: 'bad hours' }), s = f.service(); f.select(b, s);
  assert.match(f.customer.noAvailabilityMessage, /working hours need correcting/);
  b.workingHours = '9 AM - 5 PM'; f.customer.generateAvailableTimes();
  assert.match(f.customer.noAvailabilityMessage, /40-minute slot fits before 5:00 PM/);
  b.workingHours = '9 AM - 9 PM'; f.booking({time:'4:30 PM', duration:270}); f.customer.generateAvailableTimes();
  assert.equal(f.customer.availableTimes.length, 0);
  assert.match(f.customer.noAvailabilityMessage, /overlap existing appointments/);
  f.settings.settings.businessHours[0].enabled = false;
  assert.match(f.customer.noAvailabilityMessage, /salon is closed/);
});
test('add and edit photo validation belong to separate forms', () => {
  const f = fixture(), b = f.barber(); f.service();
  const c = f.make('admin/barbers/admin-barbers.component.ts', 'AdminBarbersComponent', f.barbers, f.services, f.bookings);
  c.openAddModal(); Object.assign(c.newBarber, {name:'New Barber', phone:'3001234568', specialties:['Haircut'], image:'data:image/png;base64,test'});
  c.imageValidationState = 'unsupported'; c.addBarber();
  assert.equal(f.barbers.all.length, 1);
  c.manualFaceConfirmed = true; c.addBarber();
  assert.equal(f.barbers.all.length, 2);
  c.openEditModal(b); c.editImageValidationState = 'unsupported'; c.editBarber.image = 'data:image/png;base64,edit'; c.saveBarberChanges();
  assert.equal(b.image, 'assets/images/barber-placeholder.svg');
  c.editManualFaceConfirmed = true; c.saveBarberChanges(); assert.equal(b.image, 'data:image/png;base64,edit');
});
test('cancelling either photo picker preserves its approved photo and validation', async () => {
  const f = fixture(), b = f.barber();
  const c = f.make('admin/barbers/admin-barbers.component.ts', 'AdminBarbersComponent', f.barbers, f.services, f.bookings);
  c.openAddModal(); c.newBarber.image = 'data:image/png;base64,existing'; c.imageValidationState = 'valid';
  await c.onImageSelected({target:{files:[]}});
  assert.equal(c.newBarber.image, 'data:image/png;base64,existing'); assert.equal(c.imageValidationState, 'valid');
  c.openEditModal(b); await c.onEditImageSelected({target:{files:[]}});
  assert.equal(c.editBarber.image, b.image); assert.equal(c.editImageValidationState, 'valid');
});


test('final admin lock keeps UI, booking, services and barbers unchanged', () => {
  const manifest = JSON.parse(fs.readFileSync('tests/admin-lock.manifest.json', 'utf8'));

  const gitBlobSha = filePath => {
    const content = fs.readFileSync(filePath);
    const header = Buffer.from('blob ' + content.length + '\0');
    return crypto.createHash('sha1').update(header).update(content).digest('hex');
  };

  const entries = Object.entries(manifest.protected_files);
  assert.ok(entries.length >= 40, 'Admin lock should protect the complete admin surface and booking/service/barber core.');

  for (const [filePath, expectedSha] of entries) {
    assert.ok(fs.existsSync(filePath), filePath + ' must still exist.');
    assert.equal(
      gitBlobSha(filePath),
      expectedSha,
      filePath + ' changed after the admin lock baseline. Review the change explicitly before updating tests/admin-lock.manifest.json.'
    );
  }
});
