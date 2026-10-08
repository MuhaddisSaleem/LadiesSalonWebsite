import { Component } from '@angular/core';

@Component({
  selector: 'app-whatsapp-float',
  standalone: true,
  templateUrl: './whatsapp-float.component.html',
  styleUrl: './whatsapp-float.component.scss'
})
export class WhatsappFloatComponent {
  readonly whatsappUrl =
    'https://wa.me/923048584444?text=' +
    encodeURIComponent('Hello The Trim Town Studio, I would like to book an appointment.');
}
