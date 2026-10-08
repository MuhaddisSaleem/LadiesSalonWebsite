import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminShellComponent } from '../shared/admin-shell.component';
import {
  AdminService,
  AdminServiceCategory,
  AdminServiceService,
  ServiceCategoryStatus,
  ServiceStatus
} from './admin-service.service';
import { AdminBookingService } from '../bookings/admin-booking.service';

@Component({
  selector: 'app-admin-services',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminShellComponent],
  templateUrl: './admin-services.component.html',
  styleUrl: './admin-services.component.scss'
})
export class AdminServicesComponent {
  searchTerm = '';
  selectedStatus: 'All' | ServiceStatus = 'All';
  selectedCategory: 'All' | number = 'All';

  addModalOpen = false;
  editModalOpen = false;
  deleteModalOpen = false;
  categoryModalOpen = false;

  editCandidate: AdminService | null = null;
  deleteCandidate: AdminService | null = null;
  editingCategory: AdminServiceCategory | null = null;

  feedbackMessage = '';
  feedbackType: 'success' | 'error' = 'success';

  newService = this.emptyServiceForm();
  editService = this.emptyServiceForm();
  categoryForm = this.emptyCategoryForm();

  constructor(
    public readonly serviceService: AdminServiceService,
    private readonly bookingService: AdminBookingService
  ) {}

  get filteredServices(): AdminService[] {
    const term = this.searchTerm.trim().toLowerCase();

    return this.serviceService.all
      .filter(item => this.selectedStatus === 'All' || item.status === this.selectedStatus)
      .filter(item => this.selectedCategory === 'All' || item.categoryId === this.selectedCategory)
      .filter(item =>
        !term
        || item.name.toLowerCase().includes(term)
        || item.categoryName.toLowerCase().includes(term)
      );
  }

  get inactiveCount(): number {
    return this.serviceService.all.filter(item => item.status === 'Inactive').length;
  }

  openAddModal(): void {
    this.newService = this.emptyServiceForm();
    this.newService.categoryId = this.serviceService.activeCategories[0]?.id ?? 0;
    this.addModalOpen = true;
    this.feedbackMessage = '';
  }

  closeAddModal(): void {
    this.addModalOpen = false;
  }

  openEditModal(service: AdminService): void {
    this.editCandidate = service;
    this.editService = {
      name: service.name,
      categoryId: service.categoryId,
      duration: String(service.duration),
      originalPrice: String(service.originalPrice),
      hasDiscount: this.serviceService.hasDiscount(service),
      discountPrice: service.discountPrice === null ? '' : String(service.discountPrice),
      homeServiceEnabled: service.homeServiceEnabled,
      homeOriginalPrice: service.homeOriginalPrice === null ? '' : String(service.homeOriginalPrice),
      hasHomeDiscount: this.serviceService.hasHomeDiscount(service),
      homeDiscountPrice: service.homeDiscountPrice === null ? '' : String(service.homeDiscountPrice),
      image: service.image,
      status: service.status
    };
    this.editModalOpen = true;
    this.feedbackMessage = '';
  }

  closeEditModal(): void {
    this.editModalOpen = false;
    this.editCandidate = null;
  }

  requestDelete(service: AdminService): void {
    const upcoming = this.activeUpcomingBookingsForService(service.name);
    if (upcoming.length) {
      this.showFeedback(
        false,
        service.name + ' is used by ' + upcoming.length + ' active upcoming booking' + (upcoming.length === 1 ? '' : 's') + '. Complete, cancel or move those bookings before deleting the service.'
      );
      return;
    }

    this.deleteCandidate = service;
    this.deleteModalOpen = true;
  }

  closeDeleteModal(): void {
    this.deleteModalOpen = false;
    this.deleteCandidate = null;
  }

  addService(): void {
    const payload = this.buildPayload(this.newService);
    const handle = (result: { success: boolean; message: string }) => {
      this.showFeedback(result.success, result.message);
      if (result.success) this.closeAddModal();
    };

    if (this.serviceService.addServiceThroughApi(payload, handle)) return;
    handle(this.serviceService.addService(payload));
  }

  saveService(): void {
    if (!this.editCandidate) return;

    const payload = this.buildPayload(this.editService);
    const nameChanged = payload.name.trim().toLowerCase() !== this.editCandidate.name.trim().toLowerCase();

    if (nameChanged) {
      const upcoming = this.activeUpcomingBookingsForService(this.editCandidate.name);
      if (upcoming.length) {
        this.showFeedback(
          false,
          'This service is used by active upcoming bookings. Keep its current name until those bookings are completed, cancelled or moved.'
        );
        return;
      }
    }

    const handle = (result: { success: boolean; message: string }) => {
      this.showFeedback(result.success, result.message);
      if (result.success) this.closeEditModal();
    };

    if (this.serviceService.updateServiceThroughApi(this.editCandidate.id, payload, handle)) return;
    handle(this.serviceService.updateService(this.editCandidate.id, payload));
  }

  confirmDelete(): void {
    if (!this.deleteCandidate) return;

    const handle = (result: { success: boolean; message: string }) => {
      this.showFeedback(result.success, result.message);
      if (result.success) this.closeDeleteModal();
    };

    if (this.serviceService.deleteServiceThroughApi(this.deleteCandidate.id, handle)) return;
    handle(this.serviceService.deleteService(this.deleteCandidate.id));
  }

  toggleStatus(service: AdminService): void {
    const handle = (result: { success: boolean; message: string }) =>
      this.showFeedback(result.success, result.message);

    if (this.serviceService.toggleStatusThroughApi(service.id, handle)) return;
    handle(this.serviceService.toggleStatus(service.id));
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedStatus = 'All';
    this.selectedCategory = 'All';
  }

  openCategoryManager(): void {
    this.categoryModalOpen = true;
    this.editingCategory = null;
    this.categoryForm = this.emptyCategoryForm();
    this.feedbackMessage = '';
  }

  closeCategoryManager(): void {
    this.categoryModalOpen = false;
    this.editingCategory = null;
    this.categoryForm = this.emptyCategoryForm();
  }

  editCategory(category: AdminServiceCategory): void {
    this.editingCategory = category;
    this.categoryForm = {
      name: category.name,
      sortOrder: String(category.sortOrder),
      status: category.status
    };
  }

  cancelCategoryEdit(): void {
    this.editingCategory = null;
    this.categoryForm = this.emptyCategoryForm();
  }

  saveCategory(): void {
    const payload = {
      name: this.categoryForm.name.trim(),
      sortOrder: Number(this.categoryForm.sortOrder) || 0,
      status: this.categoryForm.status
    };

    const handle = (result: { success: boolean; message: string }) => {
      this.showFeedback(result.success, result.message);
      if (result.success) {
        this.editingCategory = null;
        this.categoryForm = this.emptyCategoryForm();
      }
    };

    if (this.editingCategory) {
      if (this.serviceService.updateCategoryThroughApi(this.editingCategory.id, payload, handle)) return;
      handle(this.serviceService.updateCategory(this.editingCategory.id, payload));
      return;
    }

    if (this.serviceService.addCategoryThroughApi(payload, handle)) return;
    handle(this.serviceService.addCategory(payload));
  }

  toggleCategoryStatus(category: AdminServiceCategory): void {
    const handle = (result: { success: boolean; message: string }) =>
      this.showFeedback(result.success, result.message);

    if (this.serviceService.toggleCategoryStatusThroughApi(category.id, handle)) return;
    handle(this.serviceService.toggleCategoryStatus(category.id));
  }

  deleteCategory(category: AdminServiceCategory): void {
    if (category.serviceCount > 0 || this.serviceService.all.some(service => service.categoryId === category.id)) {
      this.showFeedback(false, 'Move or delete the services in ' + category.name + ' before deleting this category.');
      return;
    }

    const handle = (result: { success: boolean; message: string }) =>
      this.showFeedback(result.success, result.message);

    if (this.serviceService.deleteCategoryThroughApi(category.id, handle)) return;
    handle(this.serviceService.deleteCategory(category.id));
  }

  async onImageSelected(event: Event, target: 'add' | 'edit'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showFeedback(false, 'Please select a valid image file.');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.showFeedback(false, 'Service image must be smaller than 5 MB.');
      input.value = '';
      return;
    }

    try {
      const dataUrl = await this.compressImage(file);

      if (target === 'add') {
        this.newService.image = dataUrl;
      } else {
        this.editService.image = dataUrl;
      }
    } catch {
      this.showFeedback(false, 'Could not process this image. Please try another image.');
      input.value = '';
    }
  }

  priceAfterDiscount(service: AdminService): number {
    return this.serviceService.effectivePrice(service);
  }

  discountPercent(service: AdminService): number {
    return this.serviceService.discountPercent(service);
  }

  homePriceAfterDiscount(service: AdminService): number {
    return this.serviceService.effectiveHomePrice(service);
  }

  homeDiscountPercent(service: AdminService): number {
    return this.serviceService.homeDiscountPercent(service);
  }

  private activeUpcomingBookingsForService(serviceName: string) {
    const target = serviceName.trim().toLowerCase();
    const today = this.todayKey();

    return this.bookingService.all.filter(booking =>
      booking.date >= today
      && (booking.status === 'Pending' || booking.status === 'Confirmed')
      && (booking.serviceNames ?? booking.service.split(','))
        .map(name => name.trim().toLowerCase())
        .includes(target)
    );
  }

  private todayKey(): string {
    const date = this.bookingService.salonNow();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  private buildPayload(form: ReturnType<AdminServicesComponent['emptyServiceForm']>) {
    return {
      name: form.name,
      categoryId: Number(form.categoryId),
      categoryName: this.serviceService.getCategoryById(Number(form.categoryId))?.name || '',
      duration: Number(form.duration),
      originalPrice: Number(form.originalPrice),
      discountPrice: form.hasDiscount && form.discountPrice ? Number(form.discountPrice) : null,
      homeServiceEnabled: form.homeServiceEnabled,
      homeOriginalPrice: form.homeServiceEnabled && form.homeOriginalPrice ? Number(form.homeOriginalPrice) : null,
      homeDiscountPrice: form.homeServiceEnabled && form.hasHomeDiscount && form.homeDiscountPrice
        ? Number(form.homeDiscountPrice)
        : null,
      image: form.image,
      status: form.status
    };
  }

  private emptyServiceForm() {
    return {
      name: '',
      categoryId: 0,
      duration: '',
      originalPrice: '',
      hasDiscount: false,
      discountPrice: '',
      homeServiceEnabled: true,
      homeOriginalPrice: '',
      hasHomeDiscount: false,
      homeDiscountPrice: '',
      image: '',
      status: 'Active' as ServiceStatus
    };
  }

  private emptyCategoryForm() {
    return {
      name: '',
      sortOrder: '',
      status: 'Active' as ServiceCategoryStatus
    };
  }

  private compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const maxWidth = 1000;
          const maxHeight = 750;
          const ratio = Math.min(1, maxWidth / image.width, maxHeight / image.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * ratio);
          canvas.height = Math.round(image.height * ratio);

          const context = canvas.getContext('2d');
          if (!context) {
            reject(new Error('Canvas is not available.'));
            return;
          }

          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };

        image.onerror = () => reject(new Error('Invalid image.'));
        image.src = String(reader.result || '');
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private showFeedback(success: boolean, message: string): void {
    this.feedbackType = success ? 'success' : 'error';
    this.feedbackMessage = message;

    window.setTimeout(() => {
      if (this.feedbackMessage === message) this.feedbackMessage = '';
    }, 3500);
  }
}
