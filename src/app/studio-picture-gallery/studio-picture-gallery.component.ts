import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

interface StudioPicture {
  strip: string;
  frame: number;
  alt: string;
  title: string;
  className: string;
}

@Component({
  selector: 'app-studio-picture-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './studio-picture-gallery.component.html',
  styleUrl: './studio-picture-gallery.component.scss'
})
export class StudioPictureGalleryComponent {
  readonly pictures: StudioPicture[] = [
    this.photo(13, 'Wide view of HairSense barber shop', 'Main Floor', 'tile-1'),
    this.photo(2, 'Premium black and gold barber chair', 'Signature Chair', 'tile-2'),
    this.photo(11, 'Professional barber scissors', 'Tools of the Craft', 'tile-3'),
    this.photo(1, 'Dark sculptural wall art', 'Art & Character', 'tile-4'),
    this.photo(8, 'Professional grooming products', 'Professional Care', 'tile-5'),
    this.photo(7, 'Barber stations and mirrors', 'Barber Stations', 'tile-6'),
    this.photo(12, 'Blindfolded classical portrait wall art', 'HairSense Aesthetic', 'tile-7'),
    this.photo(14, 'Decorative shelving and plants', 'Thoughtful Details', 'tile-8'),
    this.photo(15, 'Warm private grooming area', 'Private Grooming', 'tile-9'),
    this.photo(19, 'Private treatment beds beneath warm pendant lights', 'Treatment Space', 'tile-10')
  ];

  photoStyle(item: StudioPicture): Record<string, string> {
    return {
      'background-image': `url("${item.strip}")`,
      'background-size': '500% auto',
      'background-position': `${item.frame * 25}% center`,
      'background-repeat': 'no-repeat'
    };
  }

  trackByPicture(_index: number, item: StudioPicture): string {
    return `${item.strip}-${item.frame}`;
  }

  private photo(sourceNumber: number, alt: string, title: string, className: string): StudioPicture {
    const stripNumber = Math.floor((sourceNumber - 1) / 5) + 1;
    const frame = (sourceNumber - 1) % 5;

    return {
      strip: `assets/images/gallery/gallery-strip-${stripNumber}.webp`,
      frame,
      alt,
      title,
      className
    };
  }
}
