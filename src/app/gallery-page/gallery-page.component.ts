import { Component } from '@angular/core';
import { GalleryComponent } from '../gallery/gallery.component';
import { HeaderComponent } from '../header/header.component';
import { StudioPictureGalleryComponent } from '../studio-picture-gallery/studio-picture-gallery.component';
import { FooterComponent } from '../footer/footer.component';
import { WhatsappFloatComponent } from '../whatsapp-float/whatsapp-float.component';

@Component({
  selector: 'app-gallery-page',
  standalone: true,
  imports: [HeaderComponent, GalleryComponent, StudioPictureGalleryComponent, FooterComponent, WhatsappFloatComponent],
  template: `
    <app-header></app-header>
    <main>
      <app-gallery></app-gallery>
      <!-- <app-studio-picture-gallery></app-studio-picture-gallery> -->
    </main>
    <app-footer></app-footer>
    <app-whatsapp-float></app-whatsapp-float>
  `
})
export class GalleryPageComponent {}
