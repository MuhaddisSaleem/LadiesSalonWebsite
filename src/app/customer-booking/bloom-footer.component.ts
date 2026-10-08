import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-bloom-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './bloom-footer.component.html',
  styleUrls: ['./customer-booking.component.scss']
})
export class BloomFooterComponent {
  readonly year = new Date().getFullYear();
}
