import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token;

  const authenticatedRequest =
    token && request.url.startsWith('/api/')
      ? request.clone({
          setHeaders: { Authorization: 'Bearer ' + token }
        })
      : request;

  return next(authenticatedRequest).pipe(
    catchError(error => {
      if (
        error instanceof HttpErrorResponse
        && error.status === 401
        && !!token
        && !request.url.endsWith('/api/auth/login')
      ) {
        auth.logout();
        void router.navigate(['/admin/login'], {
          queryParams: { returnUrl: router.url.startsWith('/admin') ? router.url : '/admin' }
        });
      }

      return throwError(() => error);
    })
  );
};
