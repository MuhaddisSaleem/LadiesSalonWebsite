import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy } from '@angular/core';

interface GalleryImage {
  src: string;
  alt: string;
  className: string;
  label: string;
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss'
})
export class GalleryComponent implements AfterViewInit, OnDestroy {
  private revealObserver?: IntersectionObserver;
  selectedIndex: number | null = null;

  readonly images: GalleryImage[] = [
    { src: 'assets/images/gallery/gallery1.jpg', alt: 'The Trim Town studio interior', className: 'tile-1', label: 'The Studio' },
    { src: 'assets/images/gallery/gallery2.jpg', alt: 'The Trim Town interior detail', className: 'tile-2', label: 'Crafted Space' },
    { src: 'assets/images/gallery/gallery3.jpg', alt: 'The Trim Town grooming area', className: 'tile-3', label: 'Main Floor' },
    { src: 'assets/images/gallery/gallery4.jpg', alt: 'The Trim Town studio atmosphere', className: 'tile-4', label: 'Details' },
    { src: 'assets/images/gallery/gallery5.jpg', alt: 'The Trim Town premium interior', className: 'tile-5', label: 'Signature Mood' },
    { src: 'assets/images/gallery/gallery6.jpg', alt: 'The Trim Town barber station', className: 'tile-6', label: 'Private Grooming' },
    { src: 'assets/images/gallery/gallery7.jpg', alt: 'The Trim Town studio details', className: 'tile-7', label: 'The Lounge' },
    { src: 'assets/images/gallery/gallery8.jpg', alt: 'The Trim Town grooming experience', className: 'tile-8', label: 'Experience' },
    { src: 'assets/images/gallery/gallery9.jpg', alt: 'The Trim Town interior view', className: 'tile-9', label: 'Art & Character' },
    { src: 'assets/images/gallery/gallery10.jpg', alt: 'The Trim Town salon space', className: 'tile-10', label: 'Tools of Craft' }
  ];

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const root = this.host.nativeElement;
    const section = root.querySelector<HTMLElement>('.studio-gallery');
    const revealElements = Array.from(root.querySelectorAll<HTMLElement>('.scroll-reveal'));

    section?.classList.add('motion-ready');

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      revealElements.forEach(element => element.classList.add('is-visible'));
      return;
    }

    this.revealObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          element.classList.add('is-visible');
          this.revealObserver?.unobserve(element);
        });
      },
      {
        root: null,
        threshold: 0.14,
        rootMargin: '0px 0px -8% 0px'
      }
    );

    revealElements.forEach(element => this.revealObserver?.observe(element));
  }

  ngOnDestroy(): void {
    this.revealObserver?.disconnect();
    document.body.style.overflow = '';
  }

  get selectedImage(): GalleryImage | null {
    return this.selectedIndex === null ? null : this.images[this.selectedIndex];
  }

  openImage(index: number): void {
    this.selectedIndex = index;
    document.body.style.overflow = 'hidden';
  }

  closeImage(): void {
    this.selectedIndex = null;
    document.body.style.overflow = '';
  }

  previousImage(): void {
    if (this.selectedIndex === null) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.images.length) % this.images.length;
  }

  nextImage(): void {
    if (this.selectedIndex === null) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.images.length;
  }

  trackBySrc(_index: number, item: GalleryImage): string {
    return item.src;
  }

  formatIndex(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (this.selectedIndex === null) return;

    if (event.key === 'Escape') this.closeImage();
    if (event.key === 'ArrowLeft') this.previousImage();
    if (event.key === 'ArrowRight') this.nextImage();
  }
}
