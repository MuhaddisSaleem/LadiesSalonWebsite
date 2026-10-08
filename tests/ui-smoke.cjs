const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve('dist/barberflow-booking/browser');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server = http.createServer((req,res)=>{
  let file=path.join(root,decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end();}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
const barber=(id,name,specialties,rating)=>({id,name,specialties,rating,phone:'+92 '+(id===1?'300':'301')+' 1234567',accountStatus:'Active',availability:'Available Today',workingHours:'9 AM - 9 PM',experience:'5 years',image:'assets/images/barber-placeholder.svg'});
const service=(id,name)=>({id,name,categoryId:1,categoryName:'Haircut',duration:40,originalPrice:600,discountPrice:null,homeServiceEnabled:true,homeOriginalPrice:900,homeDiscountPrice:null,status:'Active',image:'assets/images/service-placeholder.svg'});
const seed={
  'royal-barbers.admin-barbers.v1':[barber(1,'Falak Shair',['Haircut','Beard'],5),barber(2,'Second Barber',['Haircut'],4)],
  'royal-barbers.admin-services.v1':[service(1,'Haircut'),service(2,'Beard')]
};
let browser, activePage;
(async()=>{
  await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true});fs.mkdirSync('test-results',{recursive:true});
  let scenarios=0;
  for(const width of [1440,390]){
    const browserTimezone=process.env.QA_TT10_ONLY==='1'
      ? (width>=1000?'Pacific/Honolulu':'America/New_York')
      : 'UTC';
    const context=await browser.newContext({viewport:{width,height:1000},timezoneId:browserTimezone});
    const page=await context.newPage();activePage=page;page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));

    let apiBookings=[];
    let bookingsGetGate=null,releaseBookingsGetGate=null,bookingsGetCount=0,failNextBookingsGet=false;
    let busySlotsGetCount=0,failNextBusySlotsGet=false,walkInPostCount=0,onlinePostCount=0;
    let walkInPostGate=null,releaseWalkInPostGate=null,failNextWalkInPost=false,lastWalkInBody=null;
    let passwordPatchCount=0;
    let apiServices=JSON.parse(JSON.stringify(seed['royal-barbers.admin-services.v1']));
    let apiBarbers=JSON.parse(JSON.stringify(seed['royal-barbers.admin-barbers.v1']));
    let apiSettings={
      businessName:'Royal Barbers',businessPhone:'+92 300 1234567',whatsappNumber:'+92 300 1234567',
      email:'owner@royalbarbers.local',address:'',city:'',currency:'PKR',timezone:'Asia/Karachi',
      brandSubtitle:'LOOK GOOD · FEEL GREAT',heroEyebrow:'PREMIUM BARBERSHOP',heroHeadline:'',
      heroTagline:"More Than a Haircut. It's a Lifestyle.",bookingInterval:30,maxAdvanceDays:30,
      cancellationHours:2,lateArrivalMinutes:10,allowSameDayBooking:true,autoConfirmBookings:true,
      sendWhatsappConfirmation:true,sendSmsFallback:false,sendAppointmentReminder:true,
      reminderHoursBefore:2,notifyOwnerOnNewBooking:true,
      businessHours:['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
        .map(key=>({key,label:key[0].toUpperCase()+key.slice(1),enabled:true,open:'08:00',close:'21:00'}))
    };
    const defaultApiSettings=JSON.parse(JSON.stringify(apiSettings));
    let nextBookingId=1,nextServiceId=3,nextBarberId=3;
    const apiResponse=(body,status=200)=>({
      status,
      contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'},
      body:JSON.stringify(body)
    });
    const normalizeBooking=(input,source,id)=>({
      ...input,id,code:'RB-'+String(2600+id),
      status:source==='Walk-in'?'Confirmed':(input.serviceLocation==='Home'&&input.specialService?'Pending':'Confirmed'),
      source
    });
    const requestBody=req=>{
      const raw=req.postData();
      return raw ? JSON.parse(raw) : null;
    };
    const qaMinutes=value=>{
      const [clock,modifier]=String(value||'').split(' ');
      let [hours,minutes]=clock.split(':').map(Number);
      if(modifier==='PM'&&hours!==12)hours+=12;
      if(modifier==='AM'&&hours===12)hours=0;
      return hours*60+minutes;
    };
    const qaDashboardPayload=()=>{
      const today='2026-09-28';
      const todayBookings=apiBookings.filter(item=>item.date===today);
      const active=todayBookings.filter(item=>item.status!=='Cancelled');
      const completed=todayBookings.filter(item=>item.status==='Completed');
      const customers=new Map();
      for(const item of apiBookings){
        const key=(item.phone||'').replace(/\D/g,'')||('walkin-'+item.id);
        const bucket=customers.get(key)||[];
        bucket.push(item);customers.set(key,bucket);
      }
      const serviceGroups=new Map();
      for(const item of apiBookings.filter(item=>item.status!=='Cancelled'&&item.date>='2026-08-30'&&item.date<=today)){
        const row=serviceGroups.get(item.service)||{name:item.service,bookings:0,revenue:0};
        row.bookings++;
        if(item.status==='Completed')row.revenue+=Number(item.amount)||0;
        serviceGroups.set(item.service,row);
      }
      const topServices=[...serviceGroups.values()].sort((a,b)=>b.bookings-a.bookings||b.revenue-a.revenue).slice(0,4);
      const maxService=Math.max(1,...topServices.map(x=>x.bookings));
      const activeBarbers=apiBarbers.filter(item=>item.accountStatus==='Active');
      const recentCustomers=[...customers.values()]
        .sort((a,b)=>String(b.map(x=>x.date+' '+x.time).sort().at(-1)||'').localeCompare(String(a.map(x=>x.date+' '+x.time).sort().at(-1)||'')))
        .slice(0,4)
        .map(items=>({
          id:String(items[0].id),
          name:items.at(-1).customerName,
          phone:items.at(-1).phone||'',
          visits:items.filter(x=>x.status==='Completed').length,
          spend:items.filter(x=>x.status==='Completed').reduce((sum,x)=>sum+(Number(x.amount)||0),0)
        }));
      return {
        businessName:apiSettings.businessName||'Royal Barbers',
        today,
        summary:{
          todayBookings:active.length,
          yesterdayBookings:apiBookings.filter(item=>item.date==='2026-09-27'&&item.status!=='Cancelled').length,
          upcomingToday:todayBookings.filter(item=>(item.status==='Pending'||item.status==='Confirmed')&&qaMinutes(item.time)>=16*60+30).length,
          customers:customers.size,
          newCustomersThisMonth:[...customers.values()].filter(items=>items.some(x=>x.date>='2026-09-01'&&x.date<=today)).length,
          returningCustomers:[...customers.values()].filter(items=>items.filter(x=>x.status!=='Cancelled').length>1).length,
          activeBarbers:activeBarbers.length,
          availableBarbers:activeBarbers.filter(item=>item.availability==='Available Today').length
        },
        revenue:{
          completedToday:completed.reduce((sum,x)=>sum+(Number(x.amount)||0),0),
          completedYesterday:apiBookings.filter(item=>item.date==='2026-09-27'&&item.status==='Completed').reduce((sum,x)=>sum+(Number(x.amount)||0),0),
          bookedToday:active.reduce((sum,x)=>sum+(Number(x.amount)||0),0),
          openToday:todayBookings.filter(item=>item.status==='Pending'||item.status==='Confirmed').reduce((sum,x)=>sum+(Number(x.amount)||0),0),
          averageBookingToday:active.length?active.reduce((sum,x)=>sum+(Number(x.amount)||0),0)/active.length:0
        },
        appointments:todayBookings.slice().sort((a,b)=>qaMinutes(a.time)-qaMinutes(b.time)).map(item=>({
          id:item.id,time:item.time,customer:item.customerName,phone:item.phone||'',service:item.service,
          barber:item.barber,price:Number(item.amount)||0,status:item.status
        })),
        barberLoad:activeBarbers.map(barber=>{
          const appointments=active.filter(item=>item.barber===barber.name);
          const bookedMinutes=appointments.reduce((sum,x)=>sum+(Number(x.duration)||0),0);
          const available=barber.availability==='Available Today';
          return {id:barber.id,name:barber.name,percent:available?Math.min(100,Math.round(bookedMinutes*100/780)):0,appointments:appointments.length,available};
        }),
        topServices:topServices.map(item=>({...item,percent:Math.round(item.bookings*100/maxService)})),
        recentCustomers
      };
    };
    const qaReportsPayload=url=>{
      const parsed=new URL(url);
      const from=parsed.searchParams.get('from')||'0000-01-01';
      const to=parsed.searchParams.get('to')||'9999-12-31';
      const barber=parsed.searchParams.get('barber');
      const status=parsed.searchParams.get('status');
      const range=apiBookings.filter(item=>item.date>=from&&item.date<=to);
      const filtered=range
        .filter(item=>!barber||item.barber===barber)
        .filter(item=>!status||item.status===status);
      const completed=filtered.filter(item=>item.status==='Completed');
      const nonCancelled=filtered.filter(item=>item.status!=='Cancelled');
      const serviceGroups=new Map();
      for(const item of nonCancelled){
        const row=serviceGroups.get(item.service)||{name:item.service,bookings:0,completed:0,value:0};
        row.bookings++;row.completed+=item.status==='Completed'?1:0;row.value+=Number(item.amount)||0;
        serviceGroups.set(item.service,row);
      }
      const services=[...serviceGroups.values()].sort((a,b)=>b.bookings-a.bookings||b.value-a.value);
      const maxService=Math.max(1,...services.map(x=>x.bookings));
      const barberGroups=new Map();
      for(const item of filtered){
        const row=barberGroups.get(item.barber)||{name:item.barber,bookings:0,completed:0,cancelled:0,value:0};
        row.bookings++;row.completed+=item.status==='Completed'?1:0;row.cancelled+=item.status==='Cancelled'?1:0;
        if(item.status!=='Cancelled')row.value+=Number(item.amount)||0;
        barberGroups.set(item.barber,row);
      }
      const barberPerformance=[...barberGroups.values()].sort((a,b)=>b.bookings-a.bookings||b.value-a.value);
      const maxBarber=Math.max(1,...barberPerformance.map(x=>x.bookings));
      const dailyGroups=new Map();
      for(const item of filtered){
        const row=dailyGroups.get(item.date)||{date:item.date,bookings:0,completed:0,cancelled:0,revenue:0,bookedValue:0};
        row.bookings++;row.completed+=item.status==='Completed'?1:0;row.cancelled+=item.status==='Cancelled'?1:0;
        if(item.status==='Completed')row.revenue+=Number(item.amount)||0;
        if(item.status!=='Cancelled')row.bookedValue+=Number(item.amount)||0;
        dailyGroups.set(item.date,row);
      }
      return {
        dateFrom:from,dateTo:to,
        barbers:[...new Set(range.map(item=>item.barber))].sort(),
        summary:{
          totalBookings:filtered.length,
          completedBookings:completed.length,
          cancelledBookings:filtered.filter(item=>item.status==='Cancelled').length,
          bookedValue:nonCancelled.reduce((sum,x)=>sum+(Number(x.amount)||0),0),
          completedRevenue:completed.reduce((sum,x)=>sum+(Number(x.amount)||0),0),
          averageCompletedTicket:completed.length?completed.reduce((sum,x)=>sum+(Number(x.amount)||0),0)/completed.length:0,
          completionRate:nonCancelled.length?Math.round(completed.length*100/nonCancelled.length):0
        },
        services:services.map(item=>({...item,percent:Math.round(item.bookings*100/maxService)})),
        barberPerformance:barberPerformance.map(item=>({...item,percent:Math.round(item.bookings*100/maxBarber)})),
        daily:[...dailyGroups.values()].sort((a,b)=>b.date.localeCompare(a.date)),
        bookings:filtered.slice().sort((a,b)=>(b.date+' '+b.time).localeCompare(a.date+' '+a.time))
      };
    };
    await context.route(/\/api\//,async route=>{
      const req=route.request();
      try{
        if(req.method()==='OPTIONS')return await route.fulfill(apiResponse({}));
        const pathname=new URL(req.url()).pathname;
        const body=requestBody(req);

        if(pathname==='/api/auth/login'&&req.method()==='POST'){
          if(body?.email==='owner@royalbarbers.local'&&body?.password==='RoyalBarbers@2026'){
            return await route.fulfill(apiResponse({
              success:true,
              message:'Login successful.',
              token:'qa-admin-token',
              expiresAt:'2099-12-31T23:59:59.000Z',
              user:{id:'00000000-0000-0000-0000-000000000001',fullName:'QA Administrator',email:body.email,role:'Owner'}
            }));
          }
          return await route.fulfill(apiResponse({success:false,message:'Invalid email or password.'},401));
        }
        if(pathname==='/api/auth/me'&&req.method()==='GET'){
          return await route.fulfill(apiResponse({
            id:'00000000-0000-0000-0000-000000000001',
            fullName:'QA Administrator',
            email:'qa-admin@example.test',
            role:'Owner'
          }));
        }
        if(pathname==='/api/auth/password'&&req.method()==='PATCH'){
          passwordPatchCount++;
          if(body?.currentPassword!=='RoyalBarbers@2026'){
            return await route.fulfill(apiResponse({success:false,message:'Current password is incorrect.'},400));
          }
          if(body?.newPassword!=='ChangedPass123'){
            return await route.fulfill(apiResponse({success:false,message:'New password fixture mismatch.'},400));
          }
          return await route.fulfill(apiResponse({success:true,message:'Password changed and saved successfully.'}));
        }

        if(pathname==='/api/bootstrap/legacy-catalog'&&req.method()==='POST'){
          if(Array.isArray(body?.services)&&body.services.length)apiServices=JSON.parse(JSON.stringify(body.services));
          if(Array.isArray(body?.barbers)&&body.barbers.length)apiBarbers=JSON.parse(JSON.stringify(body.barbers));
          if(body?.settings)apiSettings=JSON.parse(JSON.stringify(body.settings));

          // TT-08 focused fixture: bootstrap is the authoritative catalogue source,
          // so inject the comma-bearing service after legacy migration has copied its data.
    if(process.env.QA_TT08_ONLY==='1'){
            const commaService='Cut, wash and style';
            if(!apiServices.some(item=>item.name===commaService)){
              const id=Math.max(0,...apiServices.map(x=>Number(x.id)||0))+1;
              apiServices=[...apiServices,service(id,commaService)];
            }
            apiBarbers=apiBarbers.map(barber=>({
              ...barber,
              specialties:Array.from(new Set([...(barber.specialties||[]),commaService]))
            }));
          }

          nextServiceId=Math.max(0,...apiServices.map(x=>Number(x.id)||0))+1;
          nextBarberId=Math.max(0,...apiBarbers.map(x=>Number(x.id)||0))+1;
          return await route.fulfill(apiResponse({success:true,imported:true,message:'Legacy catalog migrated.'}));
        }

        if(pathname==='/api/service-categories'&&req.method()==='GET')return await route.fulfill(apiResponse([{id:1,name:'Haircut',status:'Active',sortOrder:0}]));
        if(pathname==='/api/branding'&&req.method()==='GET')return await route.fulfill(apiResponse([]));
        if(/^\/api\/branding\/(logo|hero)$/.test(pathname)&&req.method()==='DELETE')return await route.fulfill({status:204});
        if(pathname==='/api/services'&&req.method()==='GET')return await route.fulfill(apiResponse(apiServices));
        if(pathname==='/api/services'&&req.method()==='POST'){
          const item={...body,id:nextServiceId++};
          apiServices=[...apiServices,item];
          apiBarbers=apiBarbers.map(barber=>({
            ...barber,
            specialties:Array.from(new Set([...(barber.specialties||[]),item.name]))
          }));
          return await route.fulfill(apiResponse({success:true,message:item.name+' added successfully.',item}));
        }
        let match=pathname.match(/^\/api\/services\/(\d+)(?:\/(status))?$/);
        if(match){
          const id=Number(match[1]),action=match[2],index=apiServices.findIndex(x=>x.id===id);
          if(index<0)return await route.fulfill(apiResponse({success:false,message:'Service not found.'},404));
          if(req.method()==='DELETE'){
            const [item]=apiServices.splice(index,1);
            apiBarbers=apiBarbers.map(barber=>({...barber,specialties:barber.specialties.filter(name=>name!==item.name)}));
            return await route.fulfill(apiResponse({success:true,message:item.name+' deleted successfully.'}));
          }
          if(req.method()==='PUT'){apiServices[index]={...apiServices[index],...body,id};return await route.fulfill(apiResponse({success:true,message:'Service updated.',item:apiServices[index]}));}
          if(req.method()==='PATCH'&&action==='status'){
            apiServices[index].status=apiServices[index].status==='Active'?'Inactive':'Active';
            return await route.fulfill(apiResponse({success:true,message:'Service status updated.',item:apiServices[index]}));
          }
        }

        if(pathname==='/api/barbers'&&req.method()==='GET')return await route.fulfill(apiResponse(apiBarbers));
        if(pathname==='/api/barbers'&&req.method()==='POST'){
          const item={
            ...body,
            id:nextBarberId++,
            specialties:apiServices.map(service=>service.name),
            leaveFrom:body.leaveFrom||null,
            leaveTo:body.leaveTo||null,
            note:body.note||''
          };
          apiBarbers=[...apiBarbers,item];
          return await route.fulfill(apiResponse({success:true,message:item.name+' added successfully.',item}));
        }
        match=pathname.match(/^\/api\/barbers\/(\d+)(?:\/(availability|leave|status))?$/);
        if(match){
          const id=Number(match[1]),action=match[2],index=apiBarbers.findIndex(x=>x.id===id);
          if(index<0)return await route.fulfill(apiResponse({success:false,message:'Barber not found.'},404));
          if(req.method()==='DELETE'){
            const [item]=apiBarbers.splice(index,1);
            return await route.fulfill(apiResponse({success:true,message:item.name+' removed from the barber list.'}));
          }
          if(req.method()==='PUT'&&!action){
            apiBarbers[index]={
              ...apiBarbers[index],
              ...body,
              id,
              specialties:apiServices.map(service=>service.name)
            };
            return await route.fulfill(apiResponse({success:true,message:'Barber updated.',item:apiBarbers[index]}));
          }
          if(req.method()==='PATCH'&&action==='availability'){
            apiBarbers[index].availability=body.availability;
            if(body.availability==='Available Today'||body.availability==='Not Available Today'){
              apiBarbers[index].leaveFrom=null;apiBarbers[index].leaveTo=null;apiBarbers[index].note='';
            }
            return await route.fulfill(apiResponse({success:true,message:'Availability updated.',item:apiBarbers[index]}));
          }
          if(req.method()==='PUT'&&action==='leave'){
            Object.assign(apiBarbers[index],{availability:body.availability,leaveFrom:body.leaveFrom,leaveTo:body.leaveTo,note:body.note||''});
            return await route.fulfill(apiResponse({success:true,message:'Leave updated.',item:apiBarbers[index]}));
          }
          if(req.method()==='PATCH'&&action==='status'){
            apiBarbers[index].accountStatus=apiBarbers[index].accountStatus==='Active'?'Inactive':'Active';
            apiBarbers[index].availability=apiBarbers[index].accountStatus==='Active'?'Available Today':'Not Available Today';
            return await route.fulfill(apiResponse({success:true,message:'Barber status updated.',item:apiBarbers[index]}));
          }
        }

        if(pathname==='/api/settings'&&req.method()==='GET')return await route.fulfill(apiResponse(apiSettings));
        if(pathname==='/api/settings'&&req.method()==='PUT'){
          apiSettings=JSON.parse(JSON.stringify(body));
          return await route.fulfill(apiResponse({success:true,message:'Settings saved successfully.',item:apiSettings}));
        }
        if(pathname==='/api/settings/reset'&&req.method()==='POST'){
          apiSettings=JSON.parse(JSON.stringify(defaultApiSettings));
          return await route.fulfill(apiResponse({success:true,message:'Settings reset to defaults.',item:apiSettings}));
        }

        if(req.method()==='GET'&&pathname==='/api/dashboard'){
          return await route.fulfill(apiResponse(qaDashboardPayload()));
        }
        if(req.method()==='GET'&&pathname==='/api/reports'){
          return await route.fulfill(apiResponse(qaReportsPayload(req.url())));
        }

        if(req.method()==='GET'&&pathname==='/api/bookings/busy-slots'){
          busySlotsGetCount++;
          if(failNextBusySlotsGet){
            failNextBusySlotsGet=false;
            return await route.fulfill(apiResponse({message:'TT-06 forced availability refresh failure.'},503));
          }
          return await route.fulfill(apiResponse(
            apiBookings
              .filter(item=>item.status!=='Cancelled')
              .map(item=>({
                id:item.id,
                barber:item.barber,
                date:item.date,
                time:item.time,
                duration:item.duration,
                status:item.status
              }))
          ));
        }
        if(req.method()==='POST'&&pathname==='/api/bookings/availability'){
          const toMinutes=value=>{
            const match=String(value||'').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
            if(!match)return Number.NaN;
            let hours=Number(match[1]),minutes=Number(match[2]||0);
            const modifier=match[3]?.toUpperCase();
            if(minutes>59||(!modifier&&!match[2]))return Number.NaN;
            if(modifier){
              if(hours<1||hours>12)return Number.NaN;
              hours=hours%12+(modifier==='PM'?12:0);
            }else if(hours>23)return Number.NaN;
            return hours*60+minutes;
          };
          const workingWindow=value=>{
            const normalized=String(value||'').replace(/[–—]/g,'-').replace(/\s+to\s+/i,' - ').trim();
            if(!normalized)return null;
            const match=normalized.match(/^(.+?)\s*-\s*(.+)$/);
            if(!match)return null;
            const start=toMinutes(match[1]),end=toMinutes(match[2]);
            return Number.isFinite(start)&&Number.isFinite(end)&&end>start?{start,end}:null;
          };
          const requestedStart=toMinutes(body.time),requestedEnd=requestedStart+Number(body.duration||0);
          const serviceNames=String(body.service||'').split(',').map(x=>x.trim()).filter(Boolean);

          // Mirror the production availability endpoint: salon hours are checked first,
          // then barber leave/overrides/working hours, then overlap protection.
          const selectedDate=new Date(body.date+'T12:00:00');
          const dayKey=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][selectedDate.getDay()];
          const salonDay=(apiSettings.businessHours||[]).find(day=>String(day.key||'').toLowerCase()===dayKey);
          const salonStart=salonDay?.enabled?toMinutes(salonDay.open):Number.NaN;
          const salonEnd=salonDay?.enabled?toMinutes(salonDay.close):Number.NaN;
          const salonWindowValid=Number.isFinite(requestedStart)
            && Number.isFinite(requestedEnd)
            && Number.isFinite(salonStart)
            && Number.isFinite(salonEnd)
            && requestedStart>=salonStart
            && requestedEnd<=salonEnd;

          if(!salonWindowValid){
            return await route.fulfill(apiResponse({
              available:false,
              message:'This appointment falls outside the configured business hours.',
              eligibleBarbers:[]
            }));
          }

          const candidates=apiBarbers.filter(barber=>{
            if(barber.accountStatus!=='Active')return false;
            if(body.barber&&barber.name!==body.barber)return false;
            if(!(serviceNames.length===1&&serviceNames[0]==='Custom Home Service')
              && !serviceNames.every(name=>(barber.specialties||[]).includes(name)))return false;

            if(barber.availability==='Not Available Today'&&body.date==='2026-09-28')return false;
            if((barber.availability==='On Leave'||barber.availability==='Vacation')
              && barber.leaveFrom&&barber.leaveTo
              && body.date>=barber.leaveFrom&&body.date<=barber.leaveTo)return false;

            const shift=workingWindow(barber.workingHours);
            if(String(barber.workingHours||'').trim()&&!shift)return false;
            if(shift&&(requestedStart<shift.start||requestedEnd>shift.end))return false;

            return true;
          });

          const eligible=candidates.filter(barber=>!apiBookings.some(item=>{
            if(item.status==='Cancelled'||item.barber!==barber.name||item.date!==body.date)return false;
            const existingStart=toMinutes(item.time),existingEnd=existingStart+Number(item.duration||0);
            return requestedStart<existingEnd&&requestedEnd>existingStart;
          }));

          return await route.fulfill(apiResponse({
            available:eligible.length>0,
            message:eligible.length?'Available.':'No eligible barber is available for this appointment window.',
            eligibleBarbers:eligible.map(x=>x.name)
          }));
        }
        if(req.method()==='GET'&&pathname==='/api/bookings'){
          bookingsGetCount++;
          if(bookingsGetGate)await bookingsGetGate;
          if(failNextBookingsGet){
            failNextBookingsGet=false;
            return await route.fulfill(apiResponse({message:'TT-06 forced bookings refresh failure.'},503));
          }
          return await route.fulfill(apiResponse(apiBookings));
        }
        if(req.method()==='POST'&&pathname==='/api/bookings/online'){
          onlinePostCount++;
          const items=body;
          if(!Array.isArray(items))throw new Error('Online booking payload is not an array');
          const created=items.map(item=>normalizeBooking(item,'Online',nextBookingId++));
          apiBookings=[...created.slice().reverse(),...apiBookings];
          return await route.fulfill(apiResponse({success:true,message:'Booking created successfully.',booking:created[0]}));
        }
        if(req.method()==='POST'&&pathname==='/api/bookings/walk-in'){
          walkInPostCount++;
          lastWalkInBody=body;
          if(walkInPostGate)await walkInPostGate;
          if(failNextWalkInPost){
            failNextWalkInPost=false;
            return await route.fulfill(apiResponse({message:'TT-07 forced walk-in failure.'},500));
          }
          const created=normalizeBooking(body,'Walk-in',nextBookingId++);
          apiBookings=[created,...apiBookings];
          return await route.fulfill(apiResponse({success:true,message:'Walk-in booked successfully.',booking:created}));
        }
        if(req.method()==='POST'&&pathname==='/api/bookings/admin'){
          const created=normalizeBooking(body,'Admin',nextBookingId++);
          apiBookings=[created,...apiBookings];
          return await route.fulfill(apiResponse({success:true,message:'Booking created successfully.',booking:created}));
        }
        match=pathname.match(/^\/api\/bookings\/(\d+)(?:\/(status|barber|schedule|special-service-price))?$/);
        if(match){
          const id=Number(match[1]),action=match[2],booking=apiBookings.find(x=>x.id===id);
          if(!booking)return await route.fulfill(apiResponse({success:false,message:'Booking not found.'},404));
          if(req.method()==='DELETE'){booking.status='Cancelled';return await route.fulfill(apiResponse({success:true,message:'Cancelled.',booking}));}
          if(action==='status')booking.status=body.status;
          if(action==='barber')booking.barber=body.barber;
          if(action==='schedule'){booking.date=body.date;booking.time=body.time;}
          if(action==='special-service-price'){const prev=booking.specialServiceAmount||0;booking.specialServiceAmount=body.amount;booking.amount=booking.amount-prev+body.amount;}
          return await route.fulfill(apiResponse({success:true,message:'Updated.',booking}));
        }

        return await route.fulfill(apiResponse({success:false,message:'Unhandled QA API route: '+req.method()+' '+pathname},404));
      }catch(error){
        return await route.fulfill(apiResponse({success:false,message:'QA API mock error: '+error.message},500));
      }
    });
    await page.clock.install({time:new Date(process.env.QA_TT10_ONLY==='1'
      ? '2026-10-05T22:30:00Z'
      : '2026-09-28T11:30:00Z')});
    await page.addInitScript(seed=>{
      if(!localStorage.getItem('qa-auth-disabled')){
        localStorage.setItem('adminToken','qa-admin-token');
        localStorage.setItem('adminTokenExpiresAt','2099-12-31T23:59:59.000Z');
        localStorage.setItem('adminUser',JSON.stringify({
          id:'00000000-0000-0000-0000-000000000001',
          fullName:'QA Administrator',
          email:'qa-admin@example.test',
          role:'Owner'
        }));
      }
      if(localStorage.getItem('qa-seeded'))return;
      for(const [key,value] of Object.entries(seed))localStorage.setItem(key,JSON.stringify(value));
      for(const type of ['barbers','services'])localStorage.setItem('royal-barbers.admin-'+type+'.demo-cleaned.v1','1');
      localStorage.setItem('qa-seeded','1');
    },seed);
    const goto=async(route='/')=>{await page.goto('http://127.0.0.1:4173'+route);await page.locator(route==='/'?'app-booking':'app-admin-shell').waitFor();};
    const day=()=>page.locator('.calendar-days button').filter({hasText:/^28$/}).click();
    const stored=async()=>apiBookings.map(item=>({...item}));
    const details=async()=>{await page.locator('#customer-name-input').fill('QA Customer');await page.locator('#customer-phone-input').fill('3001234567');};
    const finish=async()=>{await page.locator('.confirm-btn').click();await page.locator('.success-modal').waitFor();await page.locator('.success-modal button').click();};

    if(process.env.QA_TT10_ONLY==='1'){
      // At 2026-10-05 22:30Z it is already 06 Oct in Asia/Karachi, while
      // both browser zones used by this focused matrix are still on 05 Oct.
      await goto();
      await page.locator('.salon-services-grid .service-card').filter({hasText:'Haircut'}).click();
      await page.locator('.barber-card').filter({hasText:'Falak Shair'}).click();

      assert.equal((await page.locator('.calendar-header strong').innerText()).trim(),'October 2026','TT-10 public calendar must use the salon month');
      const day5=page.locator('.calendar-days button').filter({hasText:/^5$/});
      const day6=page.locator('.calendar-days button').filter({hasText:/^6$/});
      assert.equal(await day5.isDisabled(),true,'TT-10 browser-local previous day must be disabled after salon rollover');
      assert.equal(await day6.isDisabled(),false,'TT-10 salon current day must remain bookable');

      await goto('/admin/bookings');
      await page.locator('.create-booking-btn').click();
      const walkInDate=(await page.locator('.walkin-now-row > div').first().innerText()).trim();
      assert.match(walkInDate,/06\s+Oct\s+2026/i,'TT-10 walk-in date must use salon today');
      await page.locator('.modal-backdrop').click({position:{x:5,y:5}});

      await goto('/admin/calendar');
      assert.equal(await page.locator('.date-input').inputValue(),'2026-10-06','TT-10 admin calendar Today must use salon date');
      assert.match((await page.locator('.current-period strong').innerText()).trim(),/06\s+October\s+2026/i,'TT-10 admin calendar label must use salon date');

      await goto('/admin/reports');
      const reportDates=page.locator('.report-filters input[type="date"]');
      assert.equal(await reportDates.nth(0).inputValue(),'2026-10-01','TT-10 reports must start at the salon month');
      assert.equal(await reportDates.nth(1).inputValue(),'2026-10-06','TT-10 reports must end at salon today');

      scenarios+=8;
      console.log(`PASS TT-10 ${width}px (${browserTimezone}): salon date wins over browser timezone`);
      await context.close();
      continue;
    }

    if(process.env.QA_TT09_ONLY==='1'){
      await goto('/admin/account-security');
      const security=page.locator('.security-page');
      const current=security.getByPlaceholder('Current password',{exact:true});
      const next=security.getByPlaceholder('Minimum 8 characters');
      const confirm=security.getByPlaceholder('Repeat new password');
      const changeButton=security.getByRole('button',{name:'Change Password'});

      // A rejected change must not destroy a still-valid session.
      await current.fill('wrong-password');
      await next.fill('ChangedPass123');
      await confirm.fill('ChangedPass123');
      const failedBefore=passwordPatchCount;
      await changeButton.click();
      await page.locator('.feedback-toast.error').filter({hasText:'Current password is incorrect.'}).waitFor();
      assert.equal(passwordPatchCount,failedBefore+1,'TT-09 failed password change must send one PATCH');
      assert.equal(await page.evaluate(()=>localStorage.getItem('adminToken')),'qa-admin-token','TT-09 failed password change must preserve local session');
      assert.ok(page.url().endsWith('/admin/account-security'),'TT-09 failed password change must keep the admin on account security');

      // A committed password change revokes the browser session immediately.
      await current.fill('RoyalBarbers@2026');
      const successBefore=passwordPatchCount;
      await changeButton.click();
      await page.waitForURL('**/admin/login');
      assert.equal(passwordPatchCount,successBefore+1,'TT-09 successful password change must send one PATCH');
      assert.equal(await page.evaluate(()=>localStorage.getItem('adminToken')),null,'TT-09 successful password change must clear localStorage token');
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('adminToken')),null,'TT-09 successful password change must clear sessionStorage token');
      assert.equal(await page.evaluate(()=>localStorage.getItem('adminUser')),null,'TT-09 successful password change must clear cached admin user');
      assert.equal(await page.evaluate(()=>localStorage.getItem('adminTokenExpiresAt')),null,'TT-09 successful password change must clear token expiry');
      await page.locator('app-admin-login').waitFor();

      scenarios+=8;
      console.log(`PASS TT-09 ${width}px: failed change preserves session; successful change clears session and redirects to login`);
      await context.close();
      continue;
    }

    if(process.env.QA_TT08_ONLY==='1'){
      const commaService='Cut, wash and style';

      await goto('/admin/bookings');
      await page.locator('.create-booking-btn').click();
      const form=page.locator('.create-modal');
      await form.locator('.walkin-service-trigger').click();
      const commaOption=page.locator('.walkin-service-option').filter({hasText:commaService});
      await commaOption.waitFor();
      await commaOption.click();
      await page.locator('.walkin-service-overlay-backdrop').click({position:{x:5,y:5}});

      assert.equal((await form.locator('.walkin-service-trigger strong').innerText()).trim(),commaService,'TT-08 comma service must remain one selected UI item');

      const barberSelect=form.locator('select').first();
      const eligibleOption=barberSelect.locator('option').nth(1);
      await eligibleOption.waitFor({state:'attached'});
      const eligibleBarber=await eligibleOption.getAttribute('value');
      assert.ok(eligibleBarber,'TT-08 fixture requires an eligible barber');
      await barberSelect.selectOption(eligibleBarber);
      await form.getByPlaceholder('Enter full name').fill('TT08 Comma Service');

      const beforePosts=walkInPostCount;
      await form.locator('.submit-booking-btn').click();
      await form.waitFor({state:'hidden'});
      assert.equal(walkInPostCount,beforePosts+1,'TT-08 must submit one walk-in POST');
      assert.ok(lastWalkInBody,'TT-08 must capture the walk-in request');
      assert.equal(lastWalkInBody.service,commaService,'TT-08 serialized display service must preserve the comma name');
      assert.deepEqual(lastWalkInBody.serviceNames,[commaService],'TT-08 serviceNames must contain exactly one comma-bearing service');
      assert.deepEqual(apiBookings[0].serviceNames,[commaService],'TT-08 persisted browser fixture booking must keep one service name');

      // Legacy fallback: simulate an older booking record without serviceNames and
      // verify the admin filter treats an exact catalogue name as one option.
      delete apiBookings[0].serviceNames;
      await goto('/admin/bookings');
      const serviceFilter=page.locator('select[aria-label="Filter by service"]');
      const values=await serviceFilter.locator('option').allTextContents();
      assert.ok(values.includes(commaService),'TT-08 legacy booking must expose the exact comma-containing service in filters');
      assert.equal(values.includes('Cut'),false,'TT-08 legacy fallback must not split the catalogue service into Cut');
      assert.equal(values.includes('wash and style'),false,'TT-08 legacy fallback must not split the catalogue service suffix');

      scenarios+=8;
      console.log(`PASS TT-08 ${width}px: comma-containing service preserved in UI, request, persistence and legacy filters`);
      await context.close();
      continue;
    }

    if(process.env.QA_TT07_ONLY==='1'){
      await goto('/admin/bookings');

      const fillWalkIn=async name=>{
        await page.locator('.create-booking-btn').click();
        const form=page.locator('.create-modal');
        await form.locator('.walkin-service-trigger').click();
        await page.locator('.walkin-service-option').filter({hasText:'Haircut'}).click();
        await page.locator('.walkin-service-overlay-backdrop').click({position:{x:5,y:5}});
        const barberSelect=form.locator('select').first();
        const eligibleOption=barberSelect.locator('option').nth(1);
        await eligibleOption.waitFor({state:'attached'});
        const eligibleBarber=await eligibleOption.getAttribute('value');
        assert.ok(eligibleBarber,'TT-07 fixture requires an eligible walk-in barber');
        await barberSelect.selectOption(eligibleBarber);
        await form.getByPlaceholder('Enter full name').fill(name);
        return form;
      };

      // Rapid double submit: keep the first request pending and fire two click events.
      const beforeRapidPosts=walkInPostCount;
      const beforeRapidBookings=apiBookings.length;
      const rapidForm=await fillWalkIn('TT07 Rapid');
      walkInPostGate=new Promise(resolve=>{releaseWalkInPostGate=resolve;});
      await rapidForm.locator('.submit-booking-btn').evaluate(button=>{button.click();button.click();});
      for(let i=0;i<40&&walkInPostCount===beforeRapidPosts;i++)await new Promise(resolve=>setTimeout(resolve,25));
      assert.equal(walkInPostCount,beforeRapidPosts+1,'TT-07 rapid repeated submit must issue exactly one POST');
      assert.equal(await rapidForm.locator('.submit-booking-btn').isDisabled(),true,'TT-07 submit must stay disabled while request is in flight');
      await page.locator('.modal-backdrop').click({position:{x:5,y:5}});
      assert.equal(await rapidForm.isVisible(),true,'TT-07 modal must stay open while create request is in flight');
      releaseWalkInPostGate();
      walkInPostGate=null;
      releaseWalkInPostGate=null;
      await rapidForm.waitFor({state:'hidden'});
      assert.equal(apiBookings.length,beforeRapidBookings+1,'TT-07 successful rapid submit must create exactly one booking');

      // Failure must unlock the form for an intentional retry.
      const retryForm=await fillWalkIn('TT07 Retry');
      const beforeRetryPosts=walkInPostCount;
      const beforeRetryBookings=apiBookings.length;
      failNextWalkInPost=true;
      await retryForm.locator('.submit-booking-btn').click();
      await page.locator('.feedback-toast.error').filter({hasText:'TT-07 forced walk-in failure.'}).waitFor();
      assert.equal(await retryForm.isVisible(),true,'TT-07 failed create must keep the modal open');
      assert.equal(await retryForm.locator('.submit-booking-btn').isEnabled(),true,'TT-07 failed create must unlock retry');
      assert.equal(walkInPostCount,beforeRetryPosts+1,'TT-07 failed attempt must send one POST');
      assert.equal(apiBookings.length,beforeRetryBookings,'TT-07 failed attempt must not create a booking');

      await retryForm.locator('.submit-booking-btn').click();
      await retryForm.waitFor({state:'hidden'});
      await page.locator('.feedback-toast:not(.error)').filter({hasText:'Walk-in booked successfully.'}).waitFor();
      assert.equal(walkInPostCount,beforeRetryPosts+2,'TT-07 retry must send one additional POST');
      assert.equal(apiBookings.length,beforeRetryBookings+1,'TT-07 successful retry must create exactly one booking');

      scenarios+=8;
      console.log(`PASS TT-07 ${width}px: double-submit guard, failure unlock and success-close verified`);
      await context.close();
      continue;
    }

    if(process.env.QA_TT06_ONLY==='1'){
      // Authenticated path: the walk-in POST commits, then the list refresh fails.
      await goto('/admin/bookings');
      const adminBeforeBookings=apiBookings.length;
      const adminBeforePosts=walkInPostCount;
      const adminRefreshBefore=bookingsGetCount;

      await page.locator('.create-booking-btn').click();
      const tt06AdminForm=page.locator('.create-modal');
      await tt06AdminForm.locator('.walkin-service-trigger').click();
      await page.locator('.walkin-service-option').filter({hasText:'Haircut'}).click();
      await page.locator('.walkin-service-overlay-backdrop').click({position:{x:5,y:5}});
      await tt06AdminForm.locator('select').first().selectOption('Falak Shair');
      await tt06AdminForm.getByPlaceholder('Enter full name').fill('TT06 Admin');
      failNextBookingsGet=true;
      await tt06AdminForm.locator('.submit-booking-btn').click();
      await tt06AdminForm.waitFor({state:'hidden'});
      await page.locator('.feedback-toast:not(.error)').filter({hasText:'Walk-in booked successfully.'}).waitFor();
      for(let i=0;i<40&&bookingsGetCount<=adminRefreshBefore;i++)await new Promise(resolve=>setTimeout(resolve,50));
      assert.ok(bookingsGetCount>adminRefreshBefore,'TT-06 authenticated mutation must attempt a follow-up refresh');
      assert.equal(walkInPostCount,adminBeforePosts+1,'TT-06 authenticated refresh failure must not cause a duplicate POST');
      assert.equal(apiBookings.length,adminBeforeBookings+1,'TT-06 authenticated booking must remain committed after refresh failure');
      assert.equal(await page.locator('.feedback-toast.error').count(),0,'TT-06 committed walk-in must not be presented as a failed save');

      // Public path: functional behavior is viewport-independent and already has
      // authenticated/public unit coverage. Exercise the full public browser journey
      // once on desktop; keep the authenticated browser path above on both widths.
      if(width>=1000){
        await page.evaluate(()=>{
          localStorage.setItem('qa-auth-disabled','1');
          localStorage.removeItem('adminToken');
          localStorage.removeItem('adminTokenExpiresAt');
          localStorage.removeItem('adminUser');
        });
        await goto();
        await page.locator('.salon-services-grid .service-card').filter({hasText:'Haircut'}).click();
        await page.locator('.barber-card').filter({hasText:'Falak Shair'}).click();
        await day();
        const tt06PublicSlot=page.locator('.time-slot').first();
        await tt06PublicSlot.waitFor();
        await tt06PublicSlot.click();
        await details();

        const publicBeforeBookings=apiBookings.length;
        const publicBeforePosts=onlinePostCount;
        const publicRefreshBefore=busySlotsGetCount;
        failNextBusySlotsGet=true;
        await page.locator('.confirm-btn').click();
        await page.locator('.success-modal').waitFor();
        for(let i=0;i<40&&busySlotsGetCount<=publicRefreshBefore;i++)await new Promise(resolve=>setTimeout(resolve,50));
        assert.ok(busySlotsGetCount>publicRefreshBefore,'TT-06 public mutation must attempt a follow-up availability refresh');
        assert.equal(onlinePostCount,publicBeforePosts+1,'TT-06 public refresh failure must not cause a duplicate POST');
        assert.equal(apiBookings.length,publicBeforeBookings+1,'TT-06 public booking must remain committed after refresh failure');
        assert.equal(await page.locator('.success-modal').isVisible(),true,'TT-06 public customer must still see booking success');
        scenarios+=4;
      }

      scenarios+=4;
      console.log(`PASS TT-06 ${width}px: committed booking survives failed refresh without duplicate POSTs`);
      await context.close();
      continue;
    }

    if(process.env.QA_TT05_ONLY==='1'){
      apiBookings=[
        {id:71,code:'RB-TT05-A',customerName:'Deep Link One',phone:'+92 300 1111111',service:'Haircut',serviceNames:['Haircut'],duration:40,barber:'Falak Shair',date:'2026-09-28',time:'6:00 PM',amount:600,status:'Confirmed',source:'Admin',notes:'',groupSize:1,serviceLocation:'Salon'},
        {id:72,code:'RB-TT05-B',customerName:'Deep Link Two',phone:'+92 300 2222222',service:'Haircut',serviceNames:['Haircut'],duration:40,barber:'Second Barber',date:'2026-09-28',time:'7:00 PM',amount:600,status:'Confirmed',source:'Admin',notes:'',groupSize:1,serviceLocation:'Salon'}
      ];
      nextBookingId=73;
      bookingsGetGate=new Promise(resolve=>{releaseBookingsGetGate=resolve;});

      await goto('/admin/bookings?booking=71');
      assert.equal(await page.locator('.booking-drawer').count(),0,'TT-05 drawer must wait for delayed booking data');
      releaseBookingsGetGate();
      bookingsGetGate=null;
      releaseBookingsGetGate=null;
      const firstDrawer=page.locator('.booking-drawer.open');
      await firstDrawer.waitFor();
      assert.equal((await firstDrawer.locator('h3').innerText()).trim(),'RB-TT05-A','TT-05 delayed deep link must open the requested booking');

      await page.evaluate(()=>{
        history.pushState({},'', '/admin/bookings?booking=72');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      const secondHeading=page.locator('.booking-drawer.open h3').filter({hasText:'RB-TT05-B'});
      await secondHeading.waitFor();
      assert.equal((await secondHeading.innerText()).trim(),'RB-TT05-B','TT-05 route reuse must switch to the new booking');

      await page.getByRole('button',{name:'Close details'}).click();
      assert.equal(await page.locator('.booking-drawer').count(),0,'TT-05 drawer must close');

      const refreshCountBefore=bookingsGetCount;
      await page.locator('.create-booking-btn').click();
      const tt05Form=page.locator('.create-modal');
      await tt05Form.locator('.walkin-service-trigger').click();
      await page.locator('.walkin-service-option').filter({hasText:'Haircut'}).click();
      await page.locator('.walkin-service-overlay-backdrop').click({position:{x:5,y:5}});
      const tt05Barber=tt05Form.locator('select').first();
      await tt05Barber.selectOption('Falak Shair');
      await tt05Form.getByPlaceholder('Enter full name').fill('TT05 Refresh');
      await tt05Form.locator('.submit-booking-btn').click();
      await tt05Form.waitFor({state:'hidden'});
      for(let i=0;i<30&&bookingsGetCount<=refreshCountBefore;i++)await new Promise(resolve=>setTimeout(resolve,50));
      assert.ok(bookingsGetCount>refreshCountBefore,'TT-05 must observe a real background bookings refresh');
      assert.equal(await page.locator('.booking-drawer').count(),0,'TT-05 background refresh must not reopen a dismissed deep-link drawer');

      scenarios+=4;
      console.log(`PASS TT-05 ${width}px: delayed deep link, route reuse and dismissed-drawer refresh verified`);
      await context.close();
      continue;
    }

    await goto();
    // Scroll reveals must leave every booking step reachable, including long
    // sections on mobile, and must not hide a step again when scrolling back.
    const revealSections=['#service-section','#barber-section','#date-time-section','#customer-details-section'];
    for(const selector of revealSections){
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForFunction(selector=>{
        const element=document.querySelector(selector);
        return element && getComputedStyle(element).opacity==='1'
          && getComputedStyle(element).transform==='none';
      },selector);
    }
    await page.locator('#service-section').scrollIntoViewIfNeeded();
    // Only visited sections must remain revealed. Collapsed home-service cards
    // also use the directive and correctly remain pending until opened.
    for (const selector of revealSections) {
      assert.equal(await page.locator(selector).evaluate(element => element.classList.contains('booking-reveal-pending')),false,'Visited section must stay revealed: '+selector);
    }
    const imageFit=await page.locator('.salon-services-grid .service-image img').first().evaluate(img=>{
      const box=img.getBoundingClientRect();
      return {ratio:box.width/box.height,fit:getComputedStyle(img).objectFit};
    });
    assert.ok(Math.abs(imageFit.ratio-(width<=390?1:1.5))<.02,'Service photos must match the responsive square/mobile and 3:2/desktop frames');
    assert.equal(imageFit.fit,width<=390?'cover':'contain','Service photos must follow the responsive image-fit design');
    await page.emulateMedia({reducedMotion:'reduce'});
    await goto();
    assert.equal(await page.locator('.booking-reveal-pending').count(),0,'Reduced motion must never hide booking sections');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await goto();await page.locator('.salon-services-grid .service-card').filter({hasText:'Haircut'}).click();await page.locator('.barber-card').filter({hasText:'Falak Shair'}).click();await day();
    const firstSlot=page.locator('.time-slot').filter({hasText:/^5:00 PM$/});
    await firstSlot.waitFor();
    assert.ok(await firstSlot.count());
    assert.equal(await page.locator('.time-slot').filter({hasText:/^5:30 PM$/}).count(),0,'40-minute service must not use the old 30-minute slot cadence');
    assert.ok(await page.locator('.time-slot').filter({hasText:/^5:40 PM$/}).count(),'40-minute service should advance the next slot by 40 minutes');
    await page.locator('.time-slot').filter({hasText:/^5:00 PM$/}).click();await details();
    await page.screenshot({path:`test-results/customer-${width}.png`,fullPage:true});await finish();

    await page.locator('app-footer .site-footer').scrollIntoViewIfNeeded();
    const footerGap=await page.evaluate(()=>{
      const footer=document.querySelector('app-footer .site-footer');
      if(!footer)return Number.POSITIVE_INFINITY;
      const bottom=footer.getBoundingClientRect().bottom+window.scrollY;
      return Math.max(0,document.documentElement.scrollHeight-bottom);
    });
    assert.ok(footerGap<=2,'Landing page must not leave a large blank scroll area after the booking footer');

    assert.equal((await stored()).length,1);assert.equal((await stored())[0].status,'Confirmed');
    assert.equal(await page.evaluate(()=>localStorage.getItem('royal-barbers.admin-bookings.v1')),null,'Bookings must not be persisted to localStorage when API mode is active');
    assert.equal(await page.evaluate(()=>localStorage.getItem('royal-barbers.admin-services.v1')),null,'Services must be migrated out of localStorage');
    assert.equal(await page.evaluate(()=>localStorage.getItem('royal-barbers.admin-barbers.v1')),null,'Barbers must be migrated out of localStorage');scenarios++;
    // Customer's persisted booking overlaps Falak. Make Second Barber busy until 4:55 PM too,
    // so all eligible barbers are busy for more than ten minutes and the next-available fallback is exercised.
    apiBookings.push({id:900,code:'RB-WAIT',customerName:'Existing Customer',phone:'+92 300 0000000',barber:'Second Barber',service:'Haircut',duration:55,date:'2026-09-28',time:'4:00 PM',amount:600,status:'Confirmed',source:'Admin',notes:'',groupSize:1,serviceLocation:'Salon'});
    nextBookingId=Math.max(nextBookingId,901);
    await goto('/admin/bookings');await page.locator('.create-booking-btn').click();
    const form=page.locator('.create-modal'), selects=form.locator('select');
    assert.equal(await selects.count(),1,'Walk-in modal has one barber select and a service multiselect');
    assert.equal(await form.locator('textarea').count(),0,'Walk-in modal should not contain a notes field');
    const barberSelect=selects.nth(0);
    assert.equal(await barberSelect.isDisabled(),true);
    await form.locator('.walkin-service-trigger').click();
    const walkInHaircut=page.locator('.walkin-service-option').filter({hasText:'Haircut'});
    await walkInHaircut.click();
    assert.equal(await walkInHaircut.getAttribute('aria-selected'),'true','Pointer selection must select the service');
    await page.locator('.walkin-service-overlay-backdrop').click({position:{x:5,y:5}});
    await page.locator('.walkin-service-overlay').waitFor({state:'hidden'});
    assert.equal(await barberSelect.isDisabled(),false);
    const barbers=await barberSelect.locator('option').allTextContents();
    assert.ok(barbers.some(x=>x.includes('Second Barber')&&x.includes('Available in 25 min')),'Second Barber should remain bookable even when the wait is longer than ten minutes');
    await barberSelect.selectOption('Second Barber');
    await form.locator('.walkin-waiting-hint').filter({hasText:'waiting area'}).waitFor();
    await form.getByPlaceholder('Enter full name').fill('Walk-in QA');
    await page.screenshot({path:`test-results/walk-in-${width}.png`,fullPage:true});
    await form.locator('.submit-booking-btn').click();await form.waitFor({state:'hidden'});
    assert.equal((await stored()).length,3);assert.equal((await stored())[0].source,'Walk-in');assert.equal((await stored())[0].phone,'');assert.equal((await stored())[0].barber,'Second Barber');assert.equal((await stored())[0].time,'4:55 PM');assert.equal((await stored())[0].notes,'');scenarios++;
    // Owner confirmed public group booking is disabled for this client.
    // Keep single-customer journeys covered above and Home mode covered below.
    await goto();
    assert.equal(await page.locator('.booking-for-toggle button:visible').count(),0,
      'Public group-booking controls must remain disabled per client scope');
    console.log(`INFO ${width}px: group-booking journey excluded by owner request`);
    await page.locator('.home-service-selector').click();
    await page.locator('.select-salon-service-btn:visible').waitFor({state:'visible'});
    await page.locator('.home-catalog-motion.expanded').waitFor();
    assert.equal(await page.locator('.salon-catalog-motion.expanded').count(),0,'Salon service catalog must be collapsed while Home Service is active');
    assert.equal(await page.locator('.salon-choice-action-panel.visible .booking-for-toggle').count(),0,'Just Me / group choices must be visually hidden while Home Service is active');
    assert.equal(await page.locator('.home-catalog-motion.expanded .home-service-content').count(),1,'Home Service catalog must be expanded when Home Service is active');

    // Measure the final layout, not the selector's scale/height mid-transition.
    await page.locator('#service-section').evaluate(async element=>{
      await Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));
    });
    const salonActionGeometry=await page.locator('.select-salon-service-btn:visible').evaluate(button=>{
      const stage=button.closest('.salon-choice-action-stage');
      const buttonBox=button.getBoundingClientRect();
      const stageBox=stage?.getBoundingClientRect();
      return stageBox
        ? {buttonWidth:buttonBox.width,stageWidth:stageBox.width,stageHeight:stageBox.height}
        : null;
    });
    assert.ok(
      salonActionGeometry&&Math.abs(salonActionGeometry.buttonWidth-salonActionGeometry.stageWidth)<2,
      'Select Salon Service button must fill the full available action width'
    );
    if(width<=390){
      assert.equal(
        await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),
        false,
        'Salon / Home selector must not overflow the small-screen viewport'
      );
    }

    const salonIntroBox=await page.locator('.salon-service-intro').boundingBox();
    // Desktop grid items stretch to the visible intro, which can wrap with
    // different fonts. Only mobile uses the formerly stacked 154px stage.
    const homeStageLimit=width<=390?100:Math.max(100,salonIntroBox?.height||0)+2;
    assert.ok(salonActionGeometry&&salonActionGeometry.stageHeight<=homeStageLimit,'Home mode must not keep the hidden stacked salon-choice height');

    const selectorGeometry=await page.evaluate(()=>{
      const salon=document.querySelector('.salon-service-choice')?.getBoundingClientRect();
      const salonButton=Array.from(document.querySelectorAll('.select-salon-service-btn')).find(el=>el.getClientRects().length)?.getBoundingClientRect();
      const home=document.querySelector('#home-service-section')?.getBoundingClientRect();
      return salon&&salonButton&&home
        ? {gap:home.top-salonButton.bottom,salonTop:salon.top,homeTop:home.top}
        : null;
    });
    if(width<=390){
      assert.ok(selectorGeometry&&selectorGeometry.gap<90,'Home Service should follow the visible Salon switch without a large empty gap on mobile');
    }
    assert.ok(selectorGeometry&&selectorGeometry.salonTop<selectorGeometry.homeTop,'Salon Service must always remain above Home Service');

    await page.locator('.select-salon-service-btn:visible').click();
    await page.locator('.salon-catalog-motion.expanded').waitFor();
    await page.getByRole('searchbox',{name:'Search salon services'}).waitFor({state:'visible'});
    assert.equal(await page.locator('.home-catalog-motion.expanded').count(),0,'Home Service catalog must collapse after switching back to Salon Service');

    await page.locator('.home-service-selector').click();await page.getByPlaceholder('Example: Groom styling for an event, special beard treatment, etc.').fill('Event styling');await day();await page.locator('.time-slot').filter({hasText:/^8:00 PM$/}).click();await details();await page.locator('#home-service-address').fill('QA test address');await finish();assert.equal((await stored())[0].status,'Pending');assert.equal((await stored())[0].specialService,'Event styling');scenarios++;
    // Dashboard and reports are read-only projections over the same persisted booking data.
    await goto('/admin');
    await page.locator('.dashboard-sync-note').waitFor();
    assert.equal(await page.locator('.dashboard-alert').count(),0,'Dashboard must render the SQL-backed QA projection without API errors');
    const expectedToday=apiBookings.filter(item=>item.date==='2026-09-28'&&item.status!=='Cancelled').length;
    const dashboardBookings=page.locator('.stat-card').filter({hasText:"Today's Bookings"});
    assert.equal((await dashboardBookings.locator('.stat-value').innerText()).trim(),String(expectedToday),'Dashboard booking total must match persisted bookings');
    scenarios++;

    await goto('/admin/reports');
    await page.locator('.report-sync-note').waitFor();
    assert.equal(await page.locator('.report-alert').count(),0,'Reports must render the SQL-backed QA projection without API errors');
    const reportStatus=page.locator('.report-filters select').nth(1);
    await reportStatus.selectOption('Confirmed');
    await page.locator('.refresh-report-btn').filter({hasText:'Refresh'}).waitFor();
    const expectedConfirmed=apiBookings.filter(item=>item.date>='2026-09-01'&&item.date<='2026-09-28'&&item.status==='Confirmed').length;
    const reportBookings=page.locator('.report-stats .stat-card').filter({hasText:'Total Bookings'});
    assert.equal((await reportBookings.locator('strong').innerText()).trim(),String(expectedConfirmed),'Report status filter must reflect persisted bookings');
    scenarios++;
    for(const route of ['/admin','/admin/bookings','/admin/calendar','/admin/barbers','/admin/services','/admin/customers','/admin/reports','/admin/settings','/admin/notifications']){
      await goto(route);await page.screenshot({path:`test-results/${route.replaceAll('/','-')}-${width}.png`,fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'Horizontal overflow at '+route+' '+width);scenarios++;
    }
    // Exercise the actual Add/Edit modals, including the unsupported face-detector fallback.
    await goto('/admin/barbers');
    await page.evaluate(() => Object.defineProperty(window, 'FaceDetector', {value:undefined, configurable:true}));
    const photo = async color => Buffer.from(await page.evaluate(color => {
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,64,64);
      return canvas.toDataURL('image/png').split(',')[1];
    },color),'base64');
    await page.locator('.add-barber-btn').click();
    const add=page.locator('.add-modal');
    assert.equal(await add.locator('input[type=file]').count(),1,'Add Barber must contain only its own photo field');
    assert.equal(await add.locator('.specialty-picker').count(),0,'Add Barber must not ask the admin to select specialties');
    await add.getByPlaceholder('Enter full name').fill('Modal QA Barber');
    await add.getByPlaceholder('3001234567').fill('3001234568');
    await add.locator('input[type=file]').setInputFiles({name:'qa-fixture.png',mimeType:'image/png',buffer:await photo('#2255aa')});
    await add.locator('.manual-face-confirm').waitFor();
    await add.locator('.submit-btn').click();assert.equal(await add.isVisible(),true,'Manual confirmation must still be required');
    await add.locator('.manual-face-confirm input').check();
    await page.screenshot({path:`test-results/add-barber-${width}.png`,fullPage:true});
    await add.locator('.submit-btn').click();await add.waitFor({state:'hidden'});
    assert.equal(apiBarbers.length,3);
    assert.deepEqual(
      apiBarbers.find(x=>x.name==='Modal QA Barber')?.specialties,
      apiServices.map(service=>service.name),
      'New barber should automatically receive every admin service'
    );scenarios++;

    const barberContainerSelector=width>=768?'.barbers-table tbody tr':'.mobile-barber-card';
    const modalBarber=()=>page.locator(barberContainerSelector).filter({hasText:'Modal QA Barber'});
    await modalBarber().locator('.edit-action').click();
    const edit=page.locator('.edit-modal');
    assert.equal(await edit.locator('input[type=file]').count(),1,'Edit Barber must contain Change Photo');
    assert.equal(await edit.locator('.specialty-picker').count(),0,'Edit Barber must not manually manage specialties');
    await edit.locator('input[type=file]').setInputFiles({name:'qa-replacement.png',mimeType:'image/png',buffer:await photo('#aa5522')});
    await edit.locator('.manual-face-confirm input').check();
    await page.screenshot({path:`test-results/edit-barber-${width}.png`,fullPage:true});
    await edit.locator('.submit-btn').click();await edit.waitFor({state:'hidden'});
    assert.ok(apiBarbers.find(x=>x.name==='Modal QA Barber')?.image.startsWith('data:image/'));scenarios++;

    await modalBarber().getByRole('button',{name:'Deactivate'}).click();
    await modalBarber().locator('.account-status').filter({hasText:'Inactive'}).waitFor();
    assert.equal(apiBarbers.find(x=>x.name==='Modal QA Barber')?.accountStatus,'Inactive');
    await modalBarber().getByRole('button',{name:'Activate'}).click();
    await modalBarber().locator('.account-status').filter({hasText:'Active'}).waitFor();
    assert.equal(apiBarbers.find(x=>x.name==='Modal QA Barber')?.accountStatus,'Active');scenarios++;

    await modalBarber().locator('.delete-action').click();
    const deleteDialog=page.locator('.delete-dialog');
    await deleteDialog.waitFor();
    await deleteDialog.getByRole('button',{name:'Delete Barber'}).click();
    await deleteDialog.waitFor({state:'hidden'});
    assert.equal(apiBarbers.some(x=>x.name==='Modal QA Barber'),false);scenarios++;

    // Isolated fixture: public tab starts with a short shift and no bookings.
    apiBarbers.find(item=>item.name==='Falak Shair').workingHours='9 AM - 5 PM';
    apiBookings=[];
    await goto();await page.locator('.salon-services-grid .service-card').filter({hasText:'Haircut'}).click();
    await page.locator('.barber-card').filter({hasText:'Falak Shair'}).click();await day();
    await page.locator('.no-times').filter({hasText:'40-minute slot fits before 5:00 PM'}).waitFor();
    await page.locator('#customer-name-input').fill('Keep my details');
    const adminTab=await context.newPage();await adminTab.goto('http://127.0.0.1:4173/admin/barbers');
    apiBarbers.find(item=>item.name==='Falak Shair').workingHours='9 AM - 9 PM';
    await page.bringToFront();
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.locator('.time-slot').filter({hasText:/^5:00 PM$/}).waitFor();
    assert.equal(await page.locator('#customer-name-input').inputValue(),'Keep my details');

    // A last-second booking created after the slot was shown must be caught by the
    // confirmation preflight without creating a duplicate appointment.
    await page.locator('.time-slot').filter({hasText:/^5:00 PM$/}).click();
    await page.locator('#customer-phone-input').fill('3001234567');
    const beforeConflictCount=apiBookings.length;
    apiBookings.push({id:901,code:'RB-LAST',customerName:'Other Client',phone:'+92 300 1111111',barber:'Falak Shair',service:'Haircut',duration:40,date:'2026-09-28',time:'5:00 PM',amount:600,status:'Confirmed',source:'Admin',notes:'',groupSize:1,serviceLocation:'Salon'});
    nextBookingId=Math.max(nextBookingId,902);
    await page.locator('.confirm-btn').click();
    await page.getByText('This time slot is no longer available. Please choose another time.').waitFor();
    await page.locator('.time-slot').filter({hasText:/^5:00 PM$/}).waitFor({state:'detached'});
    assert.equal(apiBookings.length,beforeConflictCount+1,'Conflict preflight must not create a duplicate booking');

    // Cancelled appointments must release their slot again.
    apiBookings.find(item=>item.id===901).status='Cancelled';
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.locator('.time-slot').filter({hasText:/^5:00 PM$/}).waitFor();

    // A booking created elsewhere must disappear from this already-open customer's slot grid
    // after the async busy-slot refresh completes.
    apiBookings.push({id:902,code:'RB-ASYNC',customerName:'Other Client',phone:'+92 300 2222222',barber:'Falak Shair',service:'Haircut',duration:40,date:'2026-09-28',time:'5:00 PM',amount:600,status:'Confirmed',source:'Admin',notes:'',groupSize:1,serviceLocation:'Salon'});
    nextBookingId=Math.max(nextBookingId,903);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.locator('.time-slot').filter({hasText:/^5:00 PM$/}).waitFor({state:'detached'});

    await page.screenshot({path:`test-results/refreshed-slots-${width}.png`,fullPage:true});
    await adminTab.close();scenarios++;

    // Settings finalization: SQL persistence, deferred integrations and reset behavior.
    await goto('/admin/settings');
    // Desktop readability: verify the shared admin typography pass without touching mobile.
    if(width >= 992){
      const navFont=Number.parseFloat(await page.locator('.admin-sidebar .nav-item').first().evaluate(el=>getComputedStyle(el).fontSize));
      const headingFont=Number.parseFloat(await page.locator('.page-heading h2').evaluate(el=>getComputedStyle(el).fontSize));
      const bodyFont=Number.parseFloat(await page.locator('.page-heading p').evaluate(el=>getComputedStyle(el).fontSize));
      const controlFont=Number.parseFloat(await page.locator('.save-settings-btn:visible').evaluate(el=>getComputedStyle(el).fontSize));
      assert.ok(navFont>=15,'desktop admin navigation should be at least 15px');
      assert.ok(headingFont>=32,'desktop admin page heading should be at least 32px');
      assert.ok(bodyFont>=13,'desktop admin explanatory copy should be at least 13px');
      assert.ok(controlFont>=12,'desktop admin controls should be at least 12px');
      scenarios++;
    }

    assert.equal(await page.locator('.deferred-feature').count(),3,'Deferred customer messaging options must not render as live toggles');
    const businessNameInput=page.getByPlaceholder('Enter business name');
    await businessNameInput.fill('Royal QA Barbers');
    await page.locator('.save-settings-btn:visible').click();
    await page.locator('.feedback-toast').filter({hasText:'Settings saved successfully.'}).waitFor();
    assert.equal(apiSettings.businessName,'Royal QA Barbers');
    assert.equal(apiSettings.sendWhatsappConfirmation,false);
    assert.equal(apiSettings.sendSmsFallback,false);
    assert.equal(apiSettings.sendAppointmentReminder,false);

    await page.reload();
    await page.locator('app-admin-shell').waitFor();
    assert.equal(await page.getByPlaceholder('Enter business name').inputValue(),'Royal QA Barbers','Settings must reload from the API-backed SQL snapshot');

    await page.locator('.reset-settings-btn').click();
    const resetDialog=page.locator('.reset-dialog');
    await resetDialog.waitFor();
    await resetDialog.getByRole('button',{name:'Reset Settings'}).click();
    await resetDialog.waitFor({state:'hidden'});
    assert.equal(apiSettings.businessName,'Royal Barbers');
    await page.locator('.feedback-toast:not(.error)').filter({hasText:'Settings and landing page branding reset to defaults.'}).waitFor();
    scenarios++;

    assert.deepEqual(errors,[]);console.log(`PASS ${width}px: completed customer, admin, home, settings and nine admin-route checks (group booking intentionally disabled)`);await context.close();
  }
  console.log(`PASS ${scenarios} browser scenarios`);
})().catch(async error=>{console.error(error);if(activePage&&!activePage.isClosed()){await activePage.screenshot({path:'test-results/failure.png',fullPage:true});fs.writeFileSync('test-results/failure.html',await activePage.content());console.error((await activePage.locator('body').innerText()).slice(-4000));}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
