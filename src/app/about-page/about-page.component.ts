import { Component } from '@angular/core';
import { HeaderComponent } from '../header/header.component';
import { AboutComponent } from '../about/about.component';
import { FooterComponent } from '../footer/footer.component';
import { WhatsappFloatComponent } from '../whatsapp-float/whatsapp-float.component';

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [HeaderComponent, AboutComponent, FooterComponent, WhatsappFloatComponent],
  template: `
    <app-header></app-header>
    <main>
      <app-about></app-about>
    </main>
    <app-footer></app-footer>
    <app-whatsapp-float></app-whatsapp-float>
  `
})
export class AboutPageComponent {}
