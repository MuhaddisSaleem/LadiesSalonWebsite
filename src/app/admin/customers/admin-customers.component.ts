import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminShellComponent } from '../shared/admin-shell.component';
import { AdminBooking } from '../bookings/admin-booking.service';
import { AdminCustomer, AdminCustomerService, CustomerType } from './admin-customer.service';

@Component({
  selector: 'app-admin-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  templateUrl: './admin-customers.component.html',
  styleUrl: './admin-customers.component.scss'
})
export class AdminCustomersComponent {
  searchTerm = '';
  selectedType: 'All' | CustomerType = 'All';

  selectedCustomer: AdminCustomer | null = null;
  customerBookings: AdminBooking[] = [];
  drawerOpen = false;
  noteDraft = '';
  feedbackMessage = '';
  noteSaving = false;

  profileEditing = false;
  profileSaving = false;
  profileMessage = '';
  profileDraft = {
    name: '',
    phone: '',
    email: ''
  };

  constructor(
    public readonly customerService: AdminCustomerService,
    private readonly router: Router
  ) {}

  get customers(): AdminCustomer[] {
    const term = this.searchTerm.trim().toLowerCase();

    return this.customerService.all
      .filter(item => this.selectedType === 'All' || item.customerType === this.selectedType)
      .filter(item => {
        if (!term) return true;

        return [
          item.name,
          item.phone,
          item.email
        ].some(value => value.toLowerCase().includes(term));
      });
  }

  get totalCustomers(): number {
    return this.customerService.all.length;
  }

  get returningCustomers(): number {
    return this.customerService.all.filter(item => item.customerType === 'Returning').length;
  }

  get customersWithUpcomingBooking(): number {
    return this.customerService.all.filter(item => !!item.nextBooking).length;
  }

  get totalCompletedSpend(): number {
    return this.customerService.all.reduce((sum, item) => sum + item.totalSpend, 0);
  }

  openCustomer(customer: AdminCustomer): void {
    const fresh = this.customerService.getById(customer.id) || customer;
    this.selectedCustomer = fresh;
    this.customerBookings = this.customerService.bookingsForCustomer(fresh);
    this.noteDraft = fresh.notes;
    this.setProfileDraft(fresh);
    this.profileEditing = false;
    this.profileSaving = false;
    this.profileMessage = '';
    this.drawerOpen = true;
    this.feedbackMessage = '';
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    this.selectedCustomer = null;
    this.customerBookings = [];
    this.noteDraft = '';
    this.feedbackMessage = '';
    this.noteSaving = false;
    this.profileEditing = false;
    this.profileSaving = false;
    this.profileMessage = '';
    this.profileDraft = { name: '', phone: '', email: '' };
  }

  startProfileEdit(): void {
    if (!this.selectedCustomer) return;

    this.setProfileDraft(this.selectedCustomer);
    this.profileMessage = '';
    this.profileEditing = true;
  }

  cancelProfileEdit(): void {
    if (this.selectedCustomer) {
      this.setProfileDraft(this.selectedCustomer);
    }

    this.profileEditing = false;
    this.profileSaving = false;
    this.profileMessage = '';
  }

  saveProfile(): void {
    if (!this.selectedCustomer || this.profileSaving) return;

    const name = this.profileDraft.name.trim();
    if (!name) {
      this.showProfileMessage('Customer name is required.');
      return;
    }

    const customerId = this.selectedCustomer.id;
    this.profileSaving = true;
    this.profileMessage = '';

    this.customerService.updateProfile(customerId, {
      name,
      phone: this.profileDraft.phone.trim(),
      email: this.profileDraft.email.trim()
    }).subscribe({
      next: result => {
        this.profileSaving = false;

        if (result.success && result.customer) {
          this.selectedCustomer = result.customer;
          this.customerBookings = this.customerService.bookingsForCustomer(result.customer);
          this.noteDraft = result.customer.notes;
          this.setProfileDraft(result.customer);
          this.profileEditing = false;
        }

        this.showProfileMessage(result.message);
      },
      error: error => {
        this.profileSaving = false;
        this.showProfileMessage(
          (error as any)?.error?.message || 'Could not update the customer profile.'
        );
      }
    });
  }

  saveNote(): void {
    if (!this.selectedCustomer || this.noteSaving) return;

    const customerId = this.selectedCustomer.id;
    this.noteSaving = true;

    this.customerService.saveNote(customerId, this.noteDraft).subscribe({
      next: result => {
        this.noteSaving = false;

        if (result.success && result.customer) {
          this.selectedCustomer = result.customer;
          this.customerBookings = this.customerService.bookingsForCustomer(result.customer);
          this.noteDraft = result.customer.notes;
        }

        this.showFeedback(result.message);
      },
      error: error => {
        this.noteSaving = false;
        this.showFeedback((error as any)?.error?.message || 'Could not save the customer note.');
      }
    });
  }

  refreshCustomers(): void {
    this.customerService.refresh();
  }

  private setProfileDraft(customer: AdminCustomer): void {
    this.profileDraft = {
      name: customer.name,
      phone: customer.phone,
      email: customer.email
    };
  }

  private showProfileMessage(message: string): void {
    this.profileMessage = message;

    window.setTimeout(() => {
      if (this.profileMessage === message) this.profileMessage = '';
    }, 3000);
  }

  private showFeedback(message: string): void {
    this.feedbackMessage = message;

    window.setTimeout(() => {
      if (this.feedbackMessage === message) this.feedbackMessage = '';
    }, 2500);
  }

  openBookings(customer: AdminCustomer): void {
    void this.router.navigate(['/admin/bookings'], {
      queryParams: { customer: customer.phone }
    });
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedType = 'All';
  }

  whatsappLink(phone: string): string {
    return 'https://wa.me/' + phone.replace(/\D/g, '');
  }

  statusClass(status: string): string {
    return status.toLowerCase();
  }
}
