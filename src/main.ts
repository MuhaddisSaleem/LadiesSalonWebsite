import { APP_INITIALIZER } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { LegacyCatalogMigrationService } from './app/core/legacy-catalog-migration.service';
import { authInterceptor } from './app/core/auth.interceptor';

function startCatalogInitialization(migration: LegacyCatalogMigrationService) {
  return () => {
    // Start immediately so any legacy browser data is captured before feature
    // services initialize, but deliberately return void so Angular does not wait
    // for network/database calls before rendering the application.
    void migration.initialize();
  };
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: startCatalogInitialization,
      deps: [LegacyCatalogMigrationService],
      multi: true
    }
  ]
})
  .catch(err => console.error(err));
