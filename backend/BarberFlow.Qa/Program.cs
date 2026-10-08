using BarberFlow.Api.Contracts.Bookings;
using BarberFlow.Api.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Domain.Enums;
using BarberFlow.Api.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

var passed = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); passed++; }
await using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
await using var db = new BarberFlowDbContext(new DbContextOptionsBuilder<BarberFlowDbContext>().UseSqlite(connection).LogTo(message => { if (Environment.GetEnvironmentVariable("QA_SQL_TRACE") == "1") Console.WriteLine(message); }).Options);
// SQLite test schema only: production explicitly maps image URLs to SQL Server nvarchar(max).
await db.Database.ExecuteSqlRawAsync(db.Database.GenerateCreateScript().Replace("nvarchar(max)", "TEXT"));
var salon = new Salon { Name = "QA", Slug = "royal-barbers", TimeZone = "UTC", Settings = new SalonSettings() };
var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1));
var category = new ServiceCategory { Salon = salon, Name = "Hair", PublicId = 1 };
var service = new Service { Salon = salon, ServiceCategory = category, PublicId = 1, Name = "Cut, wash and style", DurationMinutes = 30, OriginalPrice = 600, HomeOriginalPrice = 900, HomeServiceEnabled = true };
var barber = new Barber { Salon = salon, PublicId = 1, FullName = "QA Barber" };
barber.Services.Add(new BarberService { Barber = barber, Service = service });
barber.WorkingHours.Add(new BarberWorkingHour { DayOfWeek = day.DayOfWeek, StartTime = new TimeOnly(8, 0), EndTime = new TimeOnly(21, 0) });
salon.BusinessHours.Add(new BusinessHour { DayOfWeek = day.DayOfWeek, OpenTime = new TimeOnly(8, 0), CloseTime = new TimeOnly(21, 0) });
db.AddRange(salon, category, service, barber);
await db.SaveChangesAsync();
var config = new ConfigurationBuilder().Build();
var client = new WhatsAppCloudApiClient(new HttpClient(), config, NullLogger<WhatsAppCloudApiClient>.Instance);
var app = new BookingApplicationService(db, new WhatsAppMessagingService(db, client, config, NullLogger<WhatsAppMessagingService>.Instance));
var request = new BookingRequest("QA Customer", "+923001234567", service.Name, 1, barber.FullName, day.ToString("yyyy-MM-dd"), "9:00 AM", 1, null, 1, "Home", "QA Address", "Custom request", 10, [service.Name]);
var available = await app.CheckAvailabilityAsync(new(service.Name, request.Date, "8:00 PM", 1, barber.FullName, null, "Home", [service.Name], "Custom request"), default);
Check(!available.Available, "TT-03 mixed custom availability includes the extra hour");
var created = await app.CreateAsync(request, BookingSource.Online, default);
Check(created.Success, "TT-08 structured comma-containing service accepted: " + created.Message);
Check(created.Booking!.Duration == 90 && created.Booking.Amount == 900 && created.Booking.SpecialServiceAmount == 0, "TT-02 client price/duration/custom amount ignored");
Check(created.Booking.ServiceNames!.Single() == service.Name, "TT-08 response preserves exact name");
var priced = await app.UpdateSpecialServiceAmountAsync(created.Booking.Id, 500, default);
Check(priced.Success && priced.Booking!.Amount == 1400, "TT-11 custom price added to home total");
var lines = await db.BookingServices.Where(x => x.Booking.PublicId == created.Booking.Id).ToListAsync();
Check(lines.Sum(x => x.Amount) == 1400 && lines.Count == 2, "TT-11 report snapshots reconcile");
await app.UpdateSpecialServiceAmountAsync(created.Booking.Id, 700, default);
lines = await db.BookingServices.Where(x => x.Booking.PublicId == created.Booking.Id).ToListAsync();
Check(lines.Sum(x => x.Amount) == 1600 && lines.Count == 2, "TT-11 repricing replaces custom line without duplication");
Check(!(await app.UpdateSpecialServiceAmountAsync(created.Booking.Id, 0, default)).Success, "TT-11 zero custom price rejected");
Check(!(await app.CreateAsync(request with { Time = "12:00 PM", ServiceAddress = "" }, BookingSource.Online, default)).Success, "TT-03 home address required");
service = await db.Services.SingleAsync();
category = await db.ServiceCategories.SingleAsync();
service.HomeServiceEnabled = false; await db.SaveChangesAsync();
Check(!(await app.CheckAvailabilityAsync(new(service.Name, request.Date, "12:00 PM", 1, barber.FullName, null, "Home", [service.Name]), default)).Available, "TT-03 salon-only service unavailable at home");
service.HomeServiceEnabled = true; category.IsActive = false; await db.SaveChangesAsync();
Check(!(await app.CreateAsync(request with { Time = "12:00 PM" }, BookingSource.Online, default)).Success, "TT-03 inactive category rejected");
// Failure clears tracking by design. Reload tracked catalogue entities.
category = await db.ServiceCategories.SingleAsync(); category.IsActive = true; await db.SaveChangesAsync();
var custom = await app.CreateAsync(request with { Time = "12:00 PM", Service = "Custom Home Service", ServiceNames = [], SpecialServiceAmount = 400 }, BookingSource.Admin, default);
Check(custom.Success && custom.Booking!.Amount == 400 && custom.Booking.Duration == 60, "TT-11 admin custom-only amount included");
var customLines = await db.BookingServices.Where(x => x.Booking.PublicId == custom.Booking!.Id).ToListAsync();
Check(customLines.Count == 1 && customLines[0].Amount == 400, "TT-11 custom-only snapshot matches total");
var report = await new ReportsApplicationService(db).GetAsync(salon.Id, day, day, null, null, default);
Check(report.Services.Sum(x => x.Value) == report.Summary.BookedValue, "TT-11 actual report service totals match booked value");
Check(report.Services.Single(x => x.Name == "Custom Home Service").Value == 1100, "TT-11 report includes both repriced and custom-only amounts");
// Simulate a pre-fix historical record: custom snapshot line is missing and the
// remaining service line no longer reconciles to the immutable booking total.
var historicalBooking = await db.Bookings
    .Include(x => x.Services)
    .SingleAsync(x => x.PublicId == created.Booking.Id);
var historicalCustomLine = historicalBooking.Services
    .Single(x => x.ServiceId == null && x.ServiceName == "Custom Home Service");
db.BookingServices.Remove(historicalCustomLine);
historicalBooking.Services.Single(x => x.ServiceId != null).Amount = 850;
await db.SaveChangesAsync();

var historicalReport = await new ReportsApplicationService(db).GetAsync(salon.Id, day, day, null, null, default);
Check(historicalReport.Services.Sum(x => x.Value) == historicalReport.Summary.BookedValue,
    "TT-11 historical report values reconcile without rewriting booking totals");
Check(historicalReport.Services.Single(x => x.Name == "Custom Home Service").Value == 1100,
    "TT-11 missing historical custom line is recovered from booking snapshot");
Check(historicalReport.Services.Single(x => x.Name == "Historical adjustment").Value == 50,
    "TT-11 unexplained historical remainder is surfaced instead of guessed from current catalogue prices");
Check(historicalReport.Bookings.Single(x => x.Id == created.Booking.Id).Service.Contains("Custom Home Service"),
    "TT-11 historical booking row still identifies the custom service");
var user = new SalonUser { FullName = "QA", Email = "qa@example.test", SalonId = salon.Id, PasswordHash = "hash-before" };
var key = new string('k', 48);
var oldStamp = SessionStamp.Create(user, key);
Check(oldStamp == SessionStamp.Create(user, key), "TT-09 unchanged credentials preserve stamp");
user.PasswordHash = "hash-after";
Check(oldStamp != SessionStamp.Create(user, key), "TT-09 changed password invalidates old stamp");
Check(!oldStamp.Contains("hash-before"), "TT-09 token stamp does not expose hash");
var branding = new BrandingController(db) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
branding.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("salon_id", salon.Id.ToString())], "qa"));
var png = new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 };
var pngFile = new FormFile(new MemoryStream(png), 0, png.Length, "file", "logo.png");
Check(await branding.Put("logo", pngFile, default) is OkObjectResult, "TT-04 server persists logo");
await using var freshDb = new BarberFlowDbContext(new DbContextOptionsBuilder<BarberFlowDbContext>().UseSqlite(connection).Options);
var anonymous = new BrandingController(freshDb) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
var downloaded = await anonymous.Get("logo", default) as FileContentResult;
Check(downloaded?.ContentType == "image/png" && downloaded.FileContents.SequenceEqual(png), "TT-04 independent anonymous client reads persisted logo");
var svg = System.Text.Encoding.UTF8.GetBytes("<svg><script>alert(1)</script></svg>");
Check(await branding.Put("logo", new FormFile(new MemoryStream(svg), 0, svg.Length, "file", "fake.png"), default) is BadRequestObjectResult, "TT-04 content signature rejects disguised active media");
Check(await anonymous.Put("logo", pngFile, default) is ForbidResult, "TT-04 missing salon identity cannot upload");
await branding.Delete("logo", default);
Check(await anonymous.Get("logo", default) is NotFoundResult, "TT-04 delete removes public asset");
await HttpAuthChecks.RunAsync(Check);
Console.WriteLine($"{passed} checks passed (SQLite scenarios + in-process HTTP with EF InMemory; SQL Server integration still required).");
