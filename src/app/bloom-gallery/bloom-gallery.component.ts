import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, HostListener } from '@angular/core';
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
export class BloomGalleryComponent implements AfterViewInit {
  private revealObserver?: IntersectionObserver;
  private tileObserver?: MutationObserver;
  private revealFrame = 0;
  readonly categories = ['All','Bridal','Party Makeup','Nail Art','Hair','Skin & Spa'];
  activeCategory = 'All';
  selectedPhoto: GalleryPhoto | null = null;
  readonly photos:GalleryPhoto[] = [
    {title:"Bridal Makeup",category:"Bridal",image:'/assets/gallery/bridal-makeup.png',description:"Pakistani bridal makeup inspiration"},
    {title:"Mehndi Bridal",category:"Bridal",image:'/assets/gallery/mehndi-makeup.png',description:"Mehndi beauty with traditional floral styling"},
    {title:"Walima Bridal",category:"Bridal",image:'/assets/gallery/walima-makeup.png',description:"Elegant walima bridal look"},
    {title:"Party Glam",category:"Party Makeup",image:'/assets/gallery/party-makeup.png',description:"Soft glamorous party makeup"},
    {title:"Evening Party Look",category:"Party Makeup",image:'/assets/gallery/party-makeup-2.png',description:"Evening makeup and styling"},
    {title:"Nail Art & Polish",category:"Nail Art",image:'/assets/gallery/nails.png',description:"Detailed nail art and glossy polish"},
    {title:"Hair Styling",category:"Hair",image:'/assets/gallery/hair-styling.png',description:"Salon hairstyling and beautiful curls"},
    {title:"Facial & Skin Care",category:"Skin & Spa",image:'/assets/gallery/facial.png',description:"Relaxing facial treatment"},
  ];
  ngAfterViewInit():void {
    if(typeof window==='undefined' || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    this.revealObserver=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(entry.isIntersecting){entry.target.classList.add('tile-visible');this.revealObserver?.unobserve(entry.target);}
      }
    },{threshold:0.12,rootMargin:'0px 0px -24px 0px'});
    const collectionRoot=document.querySelector('.gallery-collection');
    if(!collectionRoot)return;
    const observeTiles=():void=>{
      collectionRoot.querySelectorAll<HTMLElement>('.gallery-tile:not(.tile-reveal)').forEach((el,index)=>{
        el.classList.add('tile-reveal');
        el.style.setProperty('--tile-delay',`${index % 3 * 85}ms`);
        this.revealObserver?.observe(el);
      });
    };
    this.revealFrame=requestAnimationFrame(observeTiles);
    this.tileObserver=new MutationObserver(observeTiles);
    this.tileObserver.observe(collectionRoot,{childList:true,subtree:true});
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
    if(img.src.includes('service-placeholder.svg'))return;
    img.src='/assets/images/bloom/service-placeholder.svg';
  }
}