import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogApiService } from './catalog-api.service';
import type { AdminService } from '../admin/services/admin-service.service';
import type { AdminBarber } from '../admin/barbers/admin-barber.service';
import type { AdminSettings } from '../admin/settings/admin-settings.service';

@Injectable({ providedIn: 'root' })
export class LegacyCatalogMigrationService {
  private readonly serviceKey = 'royal-barbers.admin-services.v1';
  private readonly barberKey = 'royal-barbers.admin-barbers.v1';
  private readonly settingsKey = 'royal-barbers.admin-settings.v1';

  constructor(private readonly api: CatalogApiService) {}

  async initialize(): Promise<void> {
    if (typeof window === 'undefined') {
      await this.safePreload();
      return;
    }

    const services = this.read<AdminService[]>(this.serviceKey);
    const barbers = this.read<AdminBarber[]>(this.barberKey);
    const settings = this.read<AdminSettings>(this.settingsKey);

    const hasLegacy =
      (Array.isArray(services) && services.length > 0)
      || (Array.isArray(barbers) && barbers.length > 0)
      || !!settings;

    if (hasLegacy) {
      try {
        const result = await firstValueFrom(this.api.importLegacyCatalog({
          services: Array.isArray(services) ? services : undefined,
          barbers: Array.isArray(barbers) ? barbers : undefined,
          settings: settings || undefined
        }));

        if (result.success && result.imported) {
          // Verify SQL can be read successfully before removing the browser backup.
          // This prevents a temporary backend/migration failure from making the
          // existing service/barber catalog appear lost.
          await this.api.preload();
          this.clearLegacyKeys();
          return;
        }
      } catch {
        // Keep the old browser data untouched when SQL/API migration is unavailable.
      }
    }

    await this.safePreload();
  }

  private async safePreload(): Promise<void> {
    try {
      await this.api.preload();
    } catch {
      // The app can still render its empty/default state and show API errors.
    }
  }

  private read<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : null;
    } catch {
      return null;
    }
  }

  private clearLegacyKeys(): void {
    [
      this.serviceKey,
      'royal-barbers.admin-service-categories.v1',
      this.barberKey,
      this.settingsKey,
      'royal-barbers.admin-services.demo-cleaned.v1',
      'royal-barbers.admin-barbers.demo-cleaned.v1'
    ].forEach(key => window.localStorage.removeItem(key));
  }
}
