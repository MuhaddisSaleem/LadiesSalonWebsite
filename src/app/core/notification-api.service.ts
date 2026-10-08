import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface NotificationApiRecord {
  id: string;
  type: string;
  title: string;
  message: string;
  createdAt: string;
  icon: string;
  unread: boolean;
  url?: string | null;
}

export interface NotificationApiMutationResult {
  success: boolean;
  message: string;
  notification?: NotificationApiRecord;
}

export interface CreateNotificationApiRequest {
  type: string;
  title: string;
  message: string;
  icon: string;
  url?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationApiService {
  private readonly baseUrl = '/api/notifications';

  constructor(private readonly http: HttpClient) {}

  getAll(): Observable<NotificationApiRecord[]> {
    return this.http.get<NotificationApiRecord[]>(this.baseUrl);
  }

  create(input: CreateNotificationApiRequest): Observable<NotificationApiMutationResult> {
    return this.http.post<NotificationApiMutationResult>(this.baseUrl, input);
  }

  markAsRead(id: string): Observable<void> {
    return this.http.patch<void>(this.baseUrl + '/' + encodeURIComponent(id) + '/read', {});
  }

  markAllAsRead(): Observable<void> {
    return this.http.patch<void>(this.baseUrl + '/read-all', {});
  }

  clearAll(): Observable<void> {
    return this.http.delete<void>(this.baseUrl);
  }
}
