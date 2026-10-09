import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, HostListener, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { CatalogApiService } from '../core/catalog-api.service';
import type { AdminService, AdminServiceCategory } from '../admin/services/admin-service.service';
import { RouterLink } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';

interface GalleryPhoto { title:string; category:string; image:string; description:string; }
@Component({
  selector:'app-bloom-gallery',
  standalone:true,
  imports:[CommonModule,RouterLink,HeaderComponent,FooterComponent],
  templateUrl:'./bloom-gallery.component.html',
  styleUrls:['./bloom-gallery.component.scss']
})
export class BloomGalleryComponent implements OnInit, AfterViewInit {
  constructor(private readonly catalog: CatalogApiService) {}
  loading = true;
  loadError = '';
  categories: string[] = ['All'];
  activeCategory = 'All';
  selectedPhoto: GalleryPhoto | null = null;
  photos: GalleryPhoto[] = [];

  ngOnInit(): void { this.loadGallery(); }
  loadGallery(): void {
    this.loading = true;
    this.loadError = '';
    forkJoin({services:this.catalog.getServices(),categories:this.catalog.getServiceCategories()}).subscribe({
      next: ({services,categories}) => {
        const activeCategories = categories.filter(c => c.status === 'Active');
        const names = new Map<number,string>(activeCategories.map(c => [c.id,c.name]));
        this.photos = services.filter(s => s.status === 'Active' && names.has(s.categoryId) && !!s.image?.trim())
          .map(s => ({title:s.name, category:names.get(s.categoryId)!, image:s.image.trim(), description:s.name + ' — ' + names.get(s.categoryId) + ' treatment'}));
        this.categories = ['All', ...activeCategories.filter(c => this.photos.some(p => p.category === c.name)).map(c => c.name)];
        if (!this.categories.includes(this.activeCategory)) this.activeCategory = 'All';
        this.loading = false;
      },
      error: () => { this.loading = false; this.loadError = 'Unable to load the salon gallery. Please try again.'; }
    });
  }

  private revealObserver?: IntersectionObserver;
  private tileObserver?: MutationObserver;
  private revealFrame = 0;

  ngAfterViewInit():void {
    if(typeof window==='undefined' || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    this.revealObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(entry.isIntersecting){entry.target.classList.add('tile-visible');this.revealObserver?.unobserve(entry.target);}
      }
    },{threshold:0.12,rootMargin:'0px 0px -24px 0px'});
    const collection=document.querySelector('.gallery-masonry');
    if(!collection)return;
    const observeTiles=():void=>{
      collection.querySelectorAll<HTMLElement>('.gallery-tile:not(.tile-reveal)').forEach((el,index)=>{
        el.classList.add('tile-reveal');
        el.style.setProperty('--tile-delay',`${index % 3 * 85}ms`);
        this.revealObserver?.observe(el);
      });
    };
    this.revealFrame=requestAnimationFrame(observeTiles);
    this.tileObserver=new MutationObserver(observeTiles);
    this.tileObserver.observe(collection,{childList:true});
  }

  get filteredPhotos():GalleryPhoto[] {
    return this.activeCategory==='All' ? this.photos : this.photos.filter(photo=>photo.category===this.activeCategory);
  }
  setCategory(category:string):void {this.activeCategory=category;}
  openPhoto(photo:GalleryPhoto):void {this.selectedPhoto=photo;document.body.style.overflow='hidden';}
  closePhoto():void {this.selectedPhoto=null;document.body.style.overflow='';}
  movePhoto(direction:number):void {
    if(!this.selectedPhoto)return;
    const photos=this.filteredPhotos;
    const next=(photos.indexOf(this.selectedPhoto)+direction+photos.length)%photos.length;
    this.selectedPhoto=photos[next];
  }
  @HostListener('document:keydown.escape') onEscape():void {if(this.selectedPhoto)this.closePhoto();}
  @HostListener('document:keydown.arrowright') onRight():void {if(this.selectedPhoto)this.movePhoto(1);}
  @HostListener('document:keydown.arrowleft') onLeft():void {if(this.selectedPhoto)this.movePhoto(-1);}
  ngOnDestroy():void {
    this.revealObserver?.disconnect();
    this.tileObserver?.disconnect();
    if(typeof window!=='undefined')cancelAnimationFrame(this.revealFrame);
    if(typeof document!=='undefined')document.body.style.overflow='';
  }
  useFallback(event:Event):void {
    const img=event.target as HTMLImageElement;
    if(img.src.includes('design-reference.png'))return;
    img.src='/assets/images/bloom/service-placeholder.svg';
  }
}