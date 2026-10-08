import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Keeps draft appointment services in sync between the catalog and homepage. */
@Injectable({ providedIn: 'root' })
export class AppointmentSelectionService {
  private readonly selection = new BehaviorSubject<number[]>([]);
  readonly selectedIds$ = this.selection.asObservable();
  get selectedIds(): number[] { return this.selection.value; }
  add(id: number): void {
    if (!this.selection.value.includes(id)) this.selection.next([...this.selection.value, id]);
  }
  toggle(id: number): void {
    this.selection.next(this.selection.value.includes(id)
      ? this.selection.value.filter(value => value !== id)
      : [...this.selection.value, id]);
  }
  clear(): void { this.selection.next([]); }
}
