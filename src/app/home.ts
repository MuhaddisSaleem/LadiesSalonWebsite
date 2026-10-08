import { Component, computed, signal } from '@angular/core';
@Component({selector:'app-home', templateUrl:'./home.html'})
export class Home {
  readonly categories = ['All', 'Hair', 'Skin', 'Nails', 'Makeup'];
  readonly activeCategory = signal('All');
  readonly services = [
    {name:'Cut & finish', category:'Hair', detail:'A fresh shape, a soft finish, a little more you.', symbol:'01'},
    {name:'Colour & shine', category:'Hair', detail:'Dimensional colour and a luminous finish.', symbol:'02'},
    {name:'The facial ritual', category:'Skin', detail:'A quiet moment dedicated to your skincare.', symbol:'03'},
    {name:'Polished details', category:'Nails', detail:'Manicure and pedicure for your everyday elegance.', symbol:'04'},
    {name:'Occasion makeup', category:'Makeup', detail:'From soft glam to a statement evening look.', symbol:'05'},
    {name:'Bridal beauty', category:'Makeup', detail:'A considered look for your most special day.', symbol:'06'}
  ];
  readonly filteredServices = computed(() => this.services.filter(s => this.activeCategory() === 'All' || s.category === this.activeCategory()));
}
