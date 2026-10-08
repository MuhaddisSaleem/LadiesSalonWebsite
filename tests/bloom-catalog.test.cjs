const {test}=require('node:test');
const assert=require('node:assert/strict');
const {of,throwError,Subject,forkJoin}=require('rxjs');
const {load}=require('./harness.cjs');
function setup(){
 const changes=new Subject();
 const data={services:[{id:1,name:'Facial',categoryId:1,status:'Active',originalPrice:2000,discountPrice:1500},{id:2,categoryId:1,status:'Inactive'},{id:3,categoryId:2,status:'Active'}],categories:[{id:1,name:'Skin',status:'Active',sortOrder:2},{id:2,name:'Hidden',status:'Inactive',sortOrder:1}]};
 const api={changes$:changes,getServices:()=>of(data.services),getServiceCategories:()=>of(data.categories)};
 const Home=load('customer-booking/customer-booking.component.ts','CustomerBookingComponent',{forkJoin: sources => forkJoin({...sources})});
 const home=new Home(api);home.ngOnInit();return {home,api,data,changes};
}
test('catalog excludes inactive services and categories, displays actual prices',()=>{
 const {home}=setup();assert.deepEqual(Array.from(home.services,s=>s.id),[1]);assert.equal(home.categories.length,1);assert.equal(home.price(home.services[0]),1500);assert.equal(home.price({...home.services[0],discountPrice:2500}),2000);home.ngOnDestroy();
});
test('catalog filters by category ID and resets pagination',()=>{
 const {home,data}=setup();home.services=Array.from({length:25},(_,i)=>({...data.services[0],id:i+1}));assert.equal(home.visibleServices.length,12);home.showMore();assert.equal(home.visibleServices.length,24);home.selectCategory(1);assert.equal(home.visibleServices.length,12);home.selectCategory(99);assert.equal(home.visibleServices.length,0);home.ngOnDestroy();
});
test('catalog update removes stale filters and destroy unsubscribes',()=>{
 const {home,data,changes}=setup();home.selectCategory(1);data.categories=[];changes.next('categories');assert.equal(home.activeFilter,'all');home.ngOnDestroy();data.services=[];changes.next('services');assert.notEqual(home.services.length,0);
});
test('failed API clears stale services and retry recovers',()=>{
 const {home,api,data}=setup();api.getServices=()=>throwError(()=>Error('offline'));home.loadServices();assert.equal(home.loading,false);assert.equal(home.services.length,0);assert.match(home.loadError,/try again/);api.getServices=()=>of(data.services);home.loadServices();assert.equal(home.loadError,'');assert.equal(home.services.length,1);home.ngOnDestroy();
});
