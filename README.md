# BarberFlow — Salon & Barber Management SaaS

Angular frontend plus an ASP.NET Core / SQL Server backend foundation for the BarberFlow SaaS project.

## Frontend

The Angular application currently contains the approved customer booking flow, admin booking management, walk-ins, barbers, services, customers, settings, calendar and reporting UI.

Run the API first on `http://localhost:5080`, then start Angular:

```bash
npm install
npm start
```

Open `http://localhost:4200`.

For the existing port-4300 workflow:

```bash
npm run start:4300
```

The Angular dev-server proxy is configured in `angular.json`, so `/api/*` is forwarded to `http://localhost:5080` whether you use `npm start`, `npm run start:4300`, or `ng serve --port 4300`.

## Backend foundation

The backend lives in:

- `backend/BarberFlow.Api`
- `docs/database-architecture.md`

The first backend phase includes:

- ASP.NET Core Web API on .NET 10
- Entity Framework Core
- SQL Server provider
- Multi-salon database model
- salon users and roles
- barbers, specialties and schedules
- services and prices
- customers
- bookings and booking-service snapshots
- business hours, leave and schedule overrides
- Docker setup for API + SQL Server
- backend CI validation

### Start SQL Server

Copy the environment example and set a strong local password:

```bash
cp .env.example .env
docker compose up -d sqlserver
```

### Configure the API connection

Set the connection string before starting the API.

macOS/Linux:

```bash
export ConnectionStrings__DefaultConnection="Server=localhost,1433;Database=BarberFlow;User Id=sa;Password=YOUR_PASSWORD;Encrypt=False;TrustServerCertificate=True"
```

PowerShell:

```powershell
$env:ConnectionStrings__DefaultConnection="Server=localhost,1433;Database=BarberFlow;User Id=sa;Password=YOUR_PASSWORD;Encrypt=False;TrustServerCertificate=True"
```

Create/update the local database and then run the API:

```bash
dotnet tool restore
dotnet restore backend/BarberFlow.Api/BarberFlow.Api.csproj
dotnet ef database update --project backend/BarberFlow.Api --startup-project backend/BarberFlow.Api
dotnet run --project backend/BarberFlow.Api
```

API HTTP URL: `http://localhost:5080`

Useful endpoints:

- `GET /health`
- `GET /api/system/info`
- `GET /api/system/database`
- `POST /api/auth/login`
- `GET /api/auth/me`

## Admin authentication

Admin routes are protected by JWT authentication. Open:

```text
http://localhost:4200/admin/login
```

or, when using the port-4300 workflow:

```text
http://localhost:4300/admin/login
```

For local **Development** only, the seeded owner account is:

```text
Email:    owner@royalbarbers.local
Password: RoyalBarbers@2026
```

The development account is created even when the local salon database already exists. Do not use the development JWT key or password in production. Production must supply a strong `Jwt__SigningKey` and real user credentials through secure configuration.

The Angular route guard protects all `/admin/**` pages except `/admin/login`. The HTTP interceptor attaches the JWT to admin API requests and expired/invalid sessions are returned to the login screen.

## Database model

See `docs/database-architecture.md` for the schema, relationships, tenant boundaries and the mapping from the current Angular/localStorage model to SQL Server.

## Booking API integration

Bookings are the first Angular module being moved from browser persistence to SQL Server.

When the ASP.NET API is available:

- authenticated admin pages load full booking records from `GET /api/bookings`;
- the public booking page loads only privacy-safe occupied slots from `GET /api/bookings/busy-slots`;
- the booking service removes the old booking localStorage key;
- online, admin and walk-in booking creates are sent to the API;
- status updates, barber reassignment, rescheduling, cancellation and custom home-service pricing are sent to the API;
- the API revalidates salon hours, barber working hours, leave, specialties and overlapping appointments before writing to SQL Server.

Bookings, Services, Barbers and Settings are now API/SQL-backed. Existing browser Services/Barbers/Settings data is imported once into SQL Server and the legacy localStorage persistence keys are removed after a successful migration.

### Booking endpoints

```text
GET    /api/bookings                 (admin auth)
GET    /api/bookings/{id}            (admin auth)
GET    /api/bookings/busy-slots      (public, no customer data)
POST   /api/bookings/online
POST   /api/bookings/walk-in        (admin auth)
POST   /api/bookings/admin           (admin auth)
POST   /api/bookings/availability
PATCH  /api/bookings/{id}/status
PATCH  /api/bookings/{id}/barber
PATCH  /api/bookings/{id}/schedule
PATCH  /api/bookings/{id}/special-service-price
DELETE /api/bookings/{id}
```

Services, Barbers and Settings now come from SQL Server through the ASP.NET Core API, so availability and admin catalog changes use the same persisted data source as bookings.

The approved frontend behavior remains the functional specification while this migration happens.
