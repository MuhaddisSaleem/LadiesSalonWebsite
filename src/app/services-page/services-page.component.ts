import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { forkJoin, Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { AppointmentSelectionService } from '../core/appointment-selection.service';
import { CatalogApiService } from '../core/catalog-api.service';
import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';
import type { AdminService, AdminServiceCategory } from '../admin/services/admin-service.service';

@Component({
 selector:'app-services-page', standalone:true,
 imports:[CommonModule,HeaderComponent,FooterComponent],
 templateUrl:'./services-page.component.html',
 styleUrls:['../customer-booking/customer-booking.component.scss','./services-page.component.scss']
})
export class ServicesPageComponent implements OnInit,OnDestroy {
 readonly fallbackImage='assets/images/bloom/service-placeholder.svg';
 services:AdminService[]=[]; categories:AdminServiceCategory[]=[];
 activeFilter:number|'all'='all'; loading=true; loadError='';
 private request?:Subscription;
 constructor(private readonly catalog:CatalogApiService,private readonly route:ActivatedRoute,private readonly router:Router, public readonly selection:AppointmentSelectionService){}
 addServiceToAppointment(event:Event,id:number):void{
  event.stopPropagation();
  this.selection.toggle(id);
 }
 openAppointment():void{
  if (!this.selection.selectedIds.length) return;
  void this.router.navigate(['/'], {fragment:'appointment'}).then(() => {
    requestAnimationFrame(() => document.getElementById('appointment')?.scrollIntoView({behavior:'smooth',block:'start'}));
  });
 }
 ngOnInit():void{this.loadServices();}
 ngOnDestroy():void{this.request?.unsubscribe();}
 loadServices():void{
  this.request?.unsubscribe();this.loading=true;this.loadError='';
  this.request=forkJoin({services:this.catalog.getServices(),categories:this.catalog.getServiceCategories()}).subscribe({
   next:({services,categories})=>{
    const inactive=new Set(categories.filter(c=>c.status!=='Active').map(c=>c.id));
    this.services=services.filter(x=>x.status==='Active'&&!inactive.has(x.categoryId));
    this.categories=categories.filter(c=>c.status==='Active').sort((a,b)=>a.sortOrder-b.sortOrder||a.id-b.id);
    const requested=(this.route.snapshot.queryParamMap.get('category')||'').trim().toLowerCase();
    if(requested){
      const matching=this.categories.find(c=>c.name.trim().toLowerCase()===requested);
      this.activeFilter=matching?.id??'all';
    }
    this.loading=false;
   },error:()=>{this.loading=false;this.loadError='We could not load services. Please try again.';}
  });
 }
 get filteredServices():AdminService[]{return this.services.filter(x=>this.activeFilter==='all'||x.categoryId===this.activeFilter);}
 selectCategory(id:number|'all'):void{this.activeFilter=id;}
 trackId(_i:number,x:{id:number}):number{return x.id;}
 hasDiscount(s:AdminService):boolean{return s.discountPrice!==null&&s.discountPrice>=0&&s.discountPrice<s.originalPrice;}
 price(s:AdminService):number{return this.hasDiscount(s)?s.discountPrice!:s.originalPrice;}
 categoryName(s:AdminService):string{return this.categories.find(c=>c.id===s.categoryId)?.name||s.categoryName||'Beauty service';}
 serviceTheme(s:AdminService):string{
  const c=this.categoryName(s).toLowerCase(),n=s.name.toLowerCase();
  if(c.includes('bridal')||/bride|walima|mehndi/.test(n))return 'bridal';
  if(c.includes('nail')||/manicure|pedicure|polish/.test(n))return 'nails';
  if(c.includes('skin')||/facial|cleanup|hydra/.test(n))return 'skin';
  if(c.includes('makeup')||/glam/.test(n))return 'makeup';
  if(c.includes('body')||/wax|thread/.test(n))return 'body';return 'hair';
 }
 hasServiceImage(s:AdminService):boolean{return !!s.image?.trim();}
 imageFailed(event:Event):void{(event.target as HTMLImageElement).src=this.fallbackImage;}
}
