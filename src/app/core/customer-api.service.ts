import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { AdminCustomer } from '../admin/customers/admin-customer.service';

export interface CustomerMutationResult {
  success: boolean;
  message: string;
  customer?: AdminCustomer;
}

export interface CustomerProfileUpdate {
  name: string;
  phone: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerApiService {
  private readonly baseUrl = '/api/customers';

  constructor(private readonly http: HttpClient) {}

  getAll(): Observable<AdminCustomer[]> {
    return this.http.get<AdminCustomer[]>(this.baseUrl);
  }

  getById(id: string): Observable<AdminCustomer> {
    return this.http.get<AdminCustomer>(this.baseUrl + '/' + encodeURIComponent(id));
  }

  updateProfile(id: string, profile: CustomerProfileUpdate): Observable<CustomerMutationResult> {
    return this.http.patch<CustomerMutationResult>(
      this.baseUrl + '/' + encodeURIComponent(id) + '/profile',
      profile
    );
  }

  saveNote(id: string, notes: string): Observable<CustomerMutationResult> {
    return this.http.patch<CustomerMutationResult>(
      this.baseUrl + '/' + encodeURIComponent(id) + '/notes',
      { notes }
    );
  }
}
