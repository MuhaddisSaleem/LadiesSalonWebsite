import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom, Observable, Subject, tap } from 'rxjs';
import type {
  AdminService,
  AdminServiceCategory,
  ServiceMutationResult
} from '../admin/services/admin-service.service';
import type { AdminBarber, BarberMutationResult } from '../admin/barbers/admin-barber.service';
import type { AdminSettings, SettingsSaveResult } from '../admin/settings/admin-settings.service';

export interface ApiMutationResult<T> {
  success: boolean;
  message: string;
  item?: T;
}

export interface LegacyCatalogImportResult {
  success: boolean;
  imported: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly servicesUrl = '/api/services';
  private readonly serviceCategoriesUrl = '/api/service-categories';
  private readonly barbersUrl = '/api/barbers';
  private readonly settingsUrl = '/api/settings';
  private readonly bootstrapUrl = '/api/bootstrap/legacy-catalog';

  serviceSnapshot: AdminService[] = [];
  categorySnapshot: AdminServiceCategory[] = [];
  barberSnapshot: AdminBarber[] = [];
  settingsSnapshot: AdminSettings | null = null;

  private readonly changeSubject = new Subject<'services' | 'categories' | 'barbers' | 'settings'>();
  readonly changes$ = this.changeSubject.asObservable();
  private readonly channel =
    typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('barberflow-catalog-sync')
      : null;

  constructor(private readonly http: HttpClient) {
    if (this.channel) {
      this.channel.onmessage = event => {
        const scope = event.data as 'services' | 'categories' | 'barbers' | 'settings';
        if (scope === 'services' || scope === 'categories' || scope === 'barbers' || scope === 'settings') {
          void this.refreshScope(scope);
        }
      };
    }
  }

  getServiceCategories(): Observable<AdminServiceCategory[]> {
    return this.http.get<AdminServiceCategory[]>(this.serviceCategoriesUrl);
  }

  addServiceCategory(
    category: Omit<AdminServiceCategory, 'id'>
  ): Observable<ApiMutationResult<AdminServiceCategory>> {
    return this.http.post<ApiMutationResult<AdminServiceCategory>>(this.serviceCategoriesUrl, category)
      .pipe(tap(result => { if (result.success) this.announce('categories'); }));
  }

  updateServiceCategory(
    id: number,
    category: Omit<AdminServiceCategory, 'id'>
  ): Observable<ApiMutationResult<AdminServiceCategory>> {
    return this.http.put<ApiMutationResult<AdminServiceCategory>>(this.serviceCategoriesUrl + '/' + id, category)
      .pipe(tap(result => { if (result.success) this.announce('categories'); }));
  }

  toggleServiceCategoryStatus(id: number): Observable<ApiMutationResult<AdminServiceCategory>> {
    return this.http.patch<ApiMutationResult<AdminServiceCategory>>(
      this.serviceCategoriesUrl + '/' + id + '/status',
      {}
    ).pipe(tap(result => { if (result.success) this.announce('categories'); }));
  }

  deleteServiceCategory(id: number): Observable<ServiceMutationResult> {
    return this.http.delete<ServiceMutationResult>(this.serviceCategoriesUrl + '/' + id)
      .pipe(tap(result => { if (result.success) this.announce('categories'); }));
  }

  getServices(): Observable<AdminService[]> {
    return this.http.get<AdminService[]>(this.servicesUrl);
  }

  addService(service: Omit<AdminService, 'id'>): Observable<ApiMutationResult<AdminService>> {
    return this.http.post<ApiMutationResult<AdminService>>(this.servicesUrl, service)
      .pipe(tap(result => { if (result.success) this.announce('services'); }));
  }

  updateService(id: number, service: Omit<AdminService, 'id'>): Observable<ApiMutationResult<AdminService>> {
    return this.http.put<ApiMutationResult<AdminService>>(this.servicesUrl + '/' + id, service)
      .pipe(tap(result => { if (result.success) this.announce('services'); }));
  }

  toggleServiceStatus(id: number): Observable<ApiMutationResult<AdminService>> {
    return this.http.patch<ApiMutationResult<AdminService>>(this.servicesUrl + '/' + id + '/status', {})
      .pipe(tap(result => { if (result.success) this.announce('services'); }));
  }

  deleteService(id: number): Observable<ServiceMutationResult> {
    return this.http.delete<ServiceMutationResult>(this.servicesUrl + '/' + id)
      .pipe(tap(result => { if (result.success) this.announce('services'); }));
  }

  getBarbers(): Observable<AdminBarber[]> {
    return this.http.get<AdminBarber[]>(this.barbersUrl);
  }

  addBarber(barber: Omit<AdminBarber, 'id'>): Observable<ApiMutationResult<AdminBarber>> {
    return this.http.post<ApiMutationResult<AdminBarber>>(this.barbersUrl, barber)
      .pipe(tap(result => { if (result.success) this.announce('barbers'); }));
  }

  updateBarber(
    id: number,
    barber: Pick<AdminBarber, 'name' | 'phone' | 'experience' | 'specialties' | 'workingHours' | 'image'>
  ): Observable<ApiMutationResult<AdminBarber>> {
    const current = this.barberSnapshot.find(item => item.id === id);
    return this.http.put<ApiMutationResult<AdminBarber>>(this.barbersUrl + '/' + id, {
      ...current,
      ...barber,
      rating: current?.rating ?? 5,
      availability: current?.availability ?? 'Available Today',
      accountStatus: current?.accountStatus ?? 'Active',
      leaveFrom: current?.leaveFrom ?? null,
      leaveTo: current?.leaveTo ?? null,
      note: current?.note ?? ''
    }).pipe(tap(result => { if (result.success) this.announce('barbers'); }));
  }

  updateBarberAvailability(id: number, availability: string): Observable<ApiMutationResult<AdminBarber>> {
    return this.http.patch<ApiMutationResult<AdminBarber>>(
      this.barbersUrl + '/' + id + '/availability',
      { availability }
    ).pipe(tap(result => { if (result.success) this.announce('barbers'); }));
  }

  updateBarberLeave(
    id: number,
    availability: 'On Leave' | 'Vacation',
    leaveFrom: string,
    leaveTo: string,
    note: string
  ): Observable<ApiMutationResult<AdminBarber>> {
    return this.http.put<ApiMutationResult<AdminBarber>>(this.barbersUrl + '/' + id + '/leave', {
      availability,
      leaveFrom,
      leaveTo,
      note
    }).pipe(tap(result => { if (result.success) this.announce('barbers'); }));
  }

  toggleBarberStatus(id: number): Observable<ApiMutationResult<AdminBarber>> {
    return this.http.patch<ApiMutationResult<AdminBarber>>(this.barbersUrl + '/' + id + '/status', {})
      .pipe(tap(result => { if (result.success) this.announce('barbers'); }));
  }

  deleteBarber(id: number): Observable<BarberMutationResult> {
    return this.http.delete<BarberMutationResult>(this.barbersUrl + '/' + id)
      .pipe(tap(result => { if (result.success) this.announce('barbers'); }));
  }

  getSettings(): Observable<AdminSettings> {
    return this.http.get<AdminSettings>(this.settingsUrl);
  }

  saveSettings(settings: AdminSettings): Observable<ApiMutationResult<AdminSettings>> {
    return this.http.put<ApiMutationResult<AdminSettings>>(this.settingsUrl, settings)
      .pipe(tap(result => { if (result.success) this.announce('settings'); }));
  }

  resetSettings(): Observable<ApiMutationResult<AdminSettings>> {
    return this.http.post<ApiMutationResult<AdminSettings>>(this.settingsUrl + '/reset', {})
      .pipe(tap(result => { if (result.success) this.announce('settings'); }));
  }

  importLegacyCatalog(payload: {
    services?: AdminService[];
    barbers?: AdminBarber[];
    settings?: AdminSettings;
  }): Observable<LegacyCatalogImportResult> {
    return this.http.post<LegacyCatalogImportResult>(this.bootstrapUrl, payload);
  }

  async preload(): Promise<void> {
    // Load catalog scopes in parallel, but publish each one as soon as it arrives.
    // A slow barber/settings request must not delay rendering services (or vice versa).
    await Promise.all([
      firstValueFrom(this.getServices()).then(services => {
        this.serviceSnapshot = services;
        this.changeSubject.next('services');
      }),
      firstValueFrom(this.getServiceCategories()).then(categories => {
        this.categorySnapshot = categories;
        this.changeSubject.next('categories');
      }),
      firstValueFrom(this.getBarbers()).then(barbers => {
        this.barberSnapshot = barbers;
        this.changeSubject.next('barbers');
      }),
      firstValueFrom(this.getSettings()).then(settings => {
        this.settingsSnapshot = settings;
        this.changeSubject.next('settings');
      })
    ]);
  }

  async refreshAllAndNotify(): Promise<void> {
    await this.preload();
  }

  private async refreshScope(scope: 'services' | 'categories' | 'barbers' | 'settings'): Promise<void> {
    if (scope === 'services') {
      this.serviceSnapshot = await firstValueFrom(this.getServices());
    } else if (scope === 'categories') {
      this.categorySnapshot = await firstValueFrom(this.getServiceCategories());
    } else if (scope === 'barbers') {
      this.barberSnapshot = await firstValueFrom(this.getBarbers());
    } else {
      this.settingsSnapshot = await firstValueFrom(this.getSettings());
    }

    this.changeSubject.next(scope);
  }

  private announce(scope: 'services' | 'categories' | 'barbers' | 'settings'): void {
    this.channel?.postMessage(scope);
  }
}
