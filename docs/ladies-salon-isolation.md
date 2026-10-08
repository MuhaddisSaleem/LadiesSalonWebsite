# Ladies Salon - independent local backend and database

This repository has its own ASP.NET Core API and SQL Server container. It does not need to connect to the Trim Town / BarberFlow local database.

## Isolation
- Database: `LadiesSalonDb`
- Docker project: `ladies-salon`
- SQL container: `ladies-salon-sql` (host TCP port `1434`, internal `1433`)
- SQL persistent volume: `ladies-salon_ladies-salon-sql-data`
- API container: `ladies-salon-api` (host HTTP port `5081`)
- Angular development server: `http://localhost:4400` via `npm start`
- Angular proxy: `http://localhost:5081`

## First launch (PowerShell)

From the **LadiesSalonWebsite** repository root:

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up -d --build
npm install
npm start
```

Replace the sample `MSSQL_SA_PASSWORD` value in the new Ladies Salon .env with a distinct strong password before starting. Do **not** copy the original project's .env or SQL data volume. The new API automatically applies EF Core migrations on startup in Development mode. Open `http://localhost:4400`.

### Running the API outside Docker (optional)

If using `dotnet run` instead of the `api` container, explicitly point at the **new SQL port and database**. An old PowerShell environment variable can silently override the repository's appsettings.

```powershell
$env:ConnectionStrings__DefaultConnection="Server=localhost,1434;Database=LadiesSalonDb;User Id=sa;Password=YOUR_NEW_LADIES_SQL_PASSWORD;Encrypt=False;TrustServerCertificate=True"
dotnet run --project backend/BarberFlow.Api --launch-profile http
```

Start Docker SQL with `docker compose up -d sqlserver` first, then run the Angular app as above. Development defaults have a distinct JWT key and seed owner; change all example credentials before any public deployment.

## Verify independence

1. Open the Ladies Salon admin through port 4400, create a test service, and verify it appears only on Ladies Salon.
2. Open the Trim Town application, confirm its catalog is unchanged.
3. Check SQL with `docker exec ladies-salon-sql ...` or connect to localhost port 1434; it must contain `LadiesSalonDb`.
4. Ensure any deployment uses a **different** database, connection string, secret, API endpoint and storage volume. Separate local Docker services do not automatically isolate hosted environments.

## Important

This intentionally creates a **fresh database**; no bookings, customers or services are copied from Trim Town. The existing controllers, entities, migrations, and booking logic are retained. The existing development seed still includes example barber-style services and staff; customize those from the Ladies Salon admin after initialization. Never delete the original BarberFlow SQL container or volume. Existing database records are not modified by these repository changes.
