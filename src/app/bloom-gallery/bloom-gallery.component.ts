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
    {title:'The beauty ritual',category:'Makeup',image:'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1000&auto=format&fit=crop&q=82',description:'The little details that make a difference'},
    {title:'Soft glam inspiration',category:'Party Makeup',image:'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=1000&auto=format&fit=crop&q=82',description:'Polished looks for your special night'},
    {title:'The bridal edit',category:'Bridal',image:'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=1000&auto=format&fit=crop&q=82',description:'Timeless beauty for beautiful moments'},
    {title:'Nails, with personality',category:'Nail Art',image:'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=1000&auto=format&fit=crop&q=82',description:'A little art at your fingertips'},
    {title:'The perfect finish',category:'Hair',image:'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1000&auto=format&fit=crop&q=82',description:'Beautiful hair, beautifully you'},
    {title:'Beauty essentials',category:'Makeup',image:'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=1000&auto=format&fit=crop&q=82',description:'From everyday beauty to a statement look'},
    {title:'Something to celebrate',category:'Party Makeup',image:'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?w=1000&auto=format&fit=crop&q=82',description:'Confident and luminous'},
    {title:'Bridal romance',category:'Bridal',image:'https://images.unsplash.com/photo-1519741497674-611481863552?w=1000&auto=format&fit=crop&q=82',description:'Inspired by a special day'},
    {title:'Modern manicure',category:'Nail Art',image:'https://images.unsplash.com/photo-1632345031435-8727f6897d53?w=1000&auto=format&fit=crop&q=82',description:'Sweet and playful nail inspiration'},
    {title:'Hair goals',category:'Hair',image:'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1000&auto=format&fit=crop&q=82',description:'Effortless styling inspiration'},
    {title:'Time for yourself',category:'Skin & Spa',image:'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1000&auto=format&fit=crop&q=82',description:'Slow down and recharge'},
    {title:'Fresh-faced glow',category:'Skin & Spa',image:'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&auto=format&fit=crop&q=82',description:'A moment dedicated to self care'}
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