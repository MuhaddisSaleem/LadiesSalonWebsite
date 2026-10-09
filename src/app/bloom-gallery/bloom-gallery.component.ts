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
  readonly categories = ['All','Makeup','Party Makeup','Bridal','Nail Art','Hair','Skin & Spa'];
  activeCategory = 'All';
  selectedPhoto: GalleryPhoto | null = null;
  readonly photos:GalleryPhoto[] = [
    {title:"Bridal Makeup Session",category:"Bridal",image:'https://images.pexels.com/photos/34037599/pexels-photo-34037599.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"South Asian bridal makeup artist at work"},
    {title:"The Bridal Eye Look",category:"Bridal",image:'https://images.pexels.com/photos/34025162/pexels-photo-34025162.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Close-up wedding eye makeup application"},
    {title:"Soft Glam Makeup",category:"Makeup",image:'https://images.pexels.com/photos/34025154/pexels-photo-34025154.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Beauty professional applying glam makeup"},
    {title:"The Finishing Touch",category:"Makeup",image:'https://images.pexels.com/photos/34025152/pexels-photo-34025152.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Precision makeup artistry"},
    {title:"Party-Ready Glow",category:"Party Makeup",image:'https://images.pexels.com/photos/34037603/pexels-photo-34037603.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Celebration makeup application close-up"},
    {title:"Occasion Makeup",category:"Party Makeup",image:'https://images.pexels.com/photos/34025162/pexels-photo-34025162.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Detailed eye makeup for special occasions"},
    {title:"Cute Floral Nails",category:"Nail Art",image:'https://images.pexels.com/photos/34885842/pexels-photo-34885842.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Pink floral nail art close-up"},
    {title:"Delicate Pink Manicure",category:"Nail Art",image:'https://images.pexels.com/photos/38901355/pexels-photo-38901355.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Elegant soft pink manicured nails"},
    {title:"Salon Nail Art",category:"Nail Art",image:'https://images.pexels.com/photos/30294773/pexels-photo-30294773.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Manicure being applied at a salon"},
    {title:"The Perfect Curls",category:"Hair",image:'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Hairstylist creating curls in salon"},
    {title:"A Salon Blowout",category:"Hair",image:'https://images.pexels.com/photos/12774385/pexels-photo-12774385.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Stylist preparing a polished hairstyle"},
    {title:"Hair Styling Session",category:"Hair",image:'https://images.pexels.com/photos/3268732/pexels-photo-3268732.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Stylist working with curling tools"},
    {title:"Facial Ritual",category:"Skin & Spa",image:'https://images.pexels.com/photos/29692111/pexels-photo-29692111.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Beautician treating client at beauty salon"},
    {title:"Skin Treatment",category:"Skin & Spa",image:'https://images.pexels.com/photos/16120497/pexels-photo-16120497.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Professional facial treatment in progress"},
    {title:"Spa Glow",category:"Skin & Spa",image:'https://images.pexels.com/photos/10600175/pexels-photo-10600175.jpeg?auto=compress&cs=tinysrgb&w=1000',description:"Relaxing skincare session in beauty studio"},
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