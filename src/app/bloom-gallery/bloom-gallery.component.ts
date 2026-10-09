import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { FooterComponent } from '../footer/footer.component';

type GalleryCategory = 'Makeup' | 'Party Makeup' | 'Bridal' | 'Nail Art' | 'Hair' | 'Skin & Spa';
interface GalleryPhoto { title:string; category:GalleryCategory; image:string; description:string; }
@Component({
  selector:'app-bloom-gallery',
  standalone:true,
  imports:[CommonModule,RouterLink,HeaderComponent,FooterComponent],
  templateUrl:'./bloom-gallery.component.html',
  styleUrls:['./bloom-gallery.component.scss']
})
export class BloomGalleryComponent implements AfterViewInit {
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

  readonly categories = ['All','Makeup','Party Makeup','Bridal','Nail Art','Hair','Skin & Spa'] as const;
  activeCategory:string='All';
  selectedPhoto:GalleryPhoto|null=null;
  readonly photos:GalleryPhoto[]=[
    {title:"The bridal glow",category:"Bridal",image:"https://images.pexels.com/photos/29460546/pexels-photo-29460546.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Pakistani bridal fashion and beauty inspiration from Lahore"},
    {title:"Soft glam, desi style",category:"Party Makeup",image:"https://images.pexels.com/photos/29413537/pexels-photo-29413537.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Elegant Pakistani festive and evening makeup inspiration"},
    {title:"A classic bridal moment",category:"Bridal",image:"https://images.pexels.com/photos/3517705/pexels-photo-3517705.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Traditional Pakistani bridal jewellery and wedding styling"},
    {title:"Cute pink manicure",category:"Nail Art",image:"https://images.unsplash.com/photo-1604654894610-df63bc536371?w=900&auto=format&fit=crop&q=80",description:"Soft pink nail inspiration for mehndi and festive occasions"},
    {title:"An elegant celebration",category:"Party Makeup",image:"https://images.pexels.com/photos/31323269/pexels-photo-31323269.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Pakistani occasion wear and elegant party styling"},
    {title:"Timeless tradition",category:"Bridal",image:"https://images.pexels.com/photos/29460598/pexels-photo-29460598.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Bridal look photographed in Lahore, Pakistan"},
    {title:"The beauty portrait",category:"Makeup",image:"https://images.pexels.com/photos/29460540/pexels-photo-29460540.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Pakistani traditional glamour with refined makeup details"},
    {title:"Petal-perfect nails",category:"Nail Art",image:"https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=900&auto=format&fit=crop&q=80",description:"Delicate manicures for Pakistani festivities and celebrations"},
    {title:"A modern Pakistani muse",category:"Hair",image:"https://images.pexels.com/photos/35228818/pexels-photo-35228818.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Elegant Pakistani fashion portrait and hairstyle inspiration"},
    {title:"Traditional elegance",category:"Makeup",image:"https://images.pexels.com/photos/36325969/pexels-photo-36325969.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Subtle makeup paired with Pakistani formal wear"},
    {title:"A moment of calm",category:"Skin & Spa",image:"https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=900&auto=format&fit=crop&q=80",description:"Relaxing skincare and salon treatment inspiration"},
    {title:"Styled for your moment",category:"Hair",image:"https://images.pexels.com/photos/28213802/pexels-photo-28213802.jpeg?auto=compress&cs=tinysrgb&w=900",description:"Pakistani formal hairstyling and jewellery inspiration"},
  ];
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
    img.src='/assets/images/bloom/design-reference.png';
  }
}