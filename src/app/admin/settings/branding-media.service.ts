import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type HeroMediaType = 'image' | 'video' | null;
interface BrandAsset { key: 'logo' | 'hero'; contentType: string; url: string; }

@Injectable({ providedIn: 'root' })
export class BrandingMediaService {
  readonly logoUrl = signal('');
  readonly heroMediaUrl = signal('');
  readonly heroMediaType = signal<HeroMediaType>(null);
  private readonly baseUrl = '/api/branding';
  private readonly ready: Promise<void>;

  constructor(private readonly http: HttpClient) {
    this.ready = this.loadAll();
  }

  saveLogo(file: File): Promise<{ success: boolean; message: string }> {
    return this.save('logo', file);
  }

  saveHeroMedia(file: File): Promise<{ success: boolean; message: string }> {
    return this.save('hero', file);
  }

  private async save(key: 'logo' | 'hero', file: File): Promise<{ success: boolean; message: string }> {
    const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type);
    const video = key === 'hero' && ['video/mp4', 'video/webm'].includes(file.type);
    if (!image && !video) return { success: false, message: 'Use PNG, JPEG, GIF, WebP, or a hero MP4/WebM video.' };
    if (!file.size || file.size > 2 * 1024 * 1024) return { success: false, message: 'Media must be 2 MB or smaller.' };
    await this.ready;
    const body = new FormData();
    body.append('file', file);
    try {
      const asset = await firstValueFrom(this.http.put<BrandAsset>(`${this.baseUrl}/${key}`, body));
      this.apply(asset);
      return { success: true, message: key === 'logo' ? 'Business logo updated.' : 'Hero media updated.' };
    } catch {
      return { success: false, message: 'Could not upload media to the server. Please try again.' };
    }
  }

  async clearLogo(): Promise<void> {
    await this.ready;
    await firstValueFrom(this.http.delete(`${this.baseUrl}/logo`));
    this.logoUrl.set('');
  }

  async clearHeroMedia(): Promise<void> {
    await this.ready;
    await firstValueFrom(this.http.delete(`${this.baseUrl}/hero`));
    this.heroMediaUrl.set('');
    this.heroMediaType.set(null);
  }

  async clearAll(): Promise<void> {
    await Promise.all([this.clearLogo(), this.clearHeroMedia()]);
  }

  private async loadAll(): Promise<void> {
    try {
      const assets = await firstValueFrom(this.http.get<BrandAsset[]>(this.baseUrl));
      assets.forEach(asset => this.apply(asset));
    } catch {
      // Public presentation remains usable when optional branding is unavailable.
    }
  }

  private apply(asset: BrandAsset): void {
    if (asset.key === 'logo') this.logoUrl.set(asset.url);
    else {
      this.heroMediaUrl.set(asset.url);
      this.heroMediaType.set(asset.contentType.startsWith('video/') ? 'video' : 'image');
    }
  }
}
