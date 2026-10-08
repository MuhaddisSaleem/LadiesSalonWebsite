const {test}=require('node:test');
const assert=require('node:assert/strict');
const {load,fixture,NEXT}=require('./harness.cjs');
function setup(){
 const f=fixture();const stylist=f.barber();const service=f.service();
 const Home=load('customer-booking/customer-booking.component.ts','CustomerBookingComponent',{
  ViewChild:()=>()=>{},BookingComponent:class{},setTimeout:fn=>fn(),document:{getElementById:()=>null},matchMedia:()=>({matches:true})
 });
 const home=new Home(f.services,f.barbers,f.settings);home.booking=f.customer;
 home.serviceId=String(service.id);home.stylistId=String(stylist.id);home.date=NEXT;
 return {home,f,stylist,service};
}
test('Bloom form hands service, stylist and date to existing booking engine',()=>{
 const {home,f,service,stylist}=setup();home.findTimes();
 assert.equal(home.showBooking,true);assert.equal(f.customer.selectedServices[0].id,service.id);
 assert.equal(f.customer.participants[0].selectedBarber.id,stylist.id);assert.equal(f.customer.selectedDate.fullDate,NEXT);
});
test('Bloom form supports automatic stylist assignment',()=>{
 const {home,f}=setup();home.stylistId='';home.findTimes();assert.equal(f.customer.participants[0].selectedBarber,'any');
});
test('Bloom form rejects missing services and out-of-window dates',()=>{
 const {home}=setup();home.serviceId='999';home.findTimes();assert.equal(home.showBooking,false);assert.match(home.formError,/service/);
 home.serviceId='1';home.date='2001-01-01';home.findTimes();assert.equal(home.showBooking,false);assert.match(home.formError,/date/);
});
test('Bloom form does not overwrite an in-progress booking',()=>{
 const {home,f,stylist,service}=setup();f.select(stylist,service);const previous=f.customer.selectedDate.fullDate;
 home.findTimes();assert.equal(f.customer.selectedDate.fullDate,previous);assert.equal(f.customer.selectedServices.length,1);
});
test('Bloom form preserves existing stylist availability checks',()=>{
 const {home,f,stylist}=setup();stylist.availability='On Leave';stylist.leaveFrom=NEXT;stylist.leaveTo=NEXT;
 home.findTimes();assert.equal(f.customer.participants[0].selectedBarber,null);assert.match(f.customer.bookingValidationMessage,/leave|available/i);
});
