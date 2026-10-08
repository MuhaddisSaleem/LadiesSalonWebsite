using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Domain.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Data;

public static class DevelopmentDataSeeder
{
    public static async Task SeedAsync(
        BarberFlowDbContext db,
        IConfiguration configuration,
        IPasswordHasher<SalonUser> passwordHasher,
        CancellationToken cancellationToken = default)
    {
        var salon = await db.Salons
            .FirstOrDefaultAsync(x => x.Slug == "ladies-salon", cancellationToken);

        if (salon is null)
        {
            salon = new Salon
            {
            Name = "Ladies Salon",
            Slug = "ladies-salon",
            Phone = "+923001234567",
            WhatsAppNumber = "+923001234567",
            Email = "owner@ladies-salon.local",
            Address = "",
            City = "",
            TimeZone = "Asia/Karachi",
            CurrencyCode = "PKR",
            Settings = new SalonSettings
            {
                BookingIntervalMinutes = 30,
                MaxAdvanceDays = 30,
                AllowSameDayBooking = true,
                AutoConfirmBookings = true,
                CancellationHours = 2,
                LateArrivalMinutes = 10,
                BrandSubtitle = "LOOK GOOD · FEEL GREAT",
                HeroEyebrow = "PREMIUM BEAUTY SALON",
                HeroHeadline = "",
                HeroTagline = "More Than a Haircut. It's a Lifestyle.",
                SendWhatsappConfirmation = false,
                SendSmsFallback = false,
                SendAppointmentReminder = false,
                ReminderHoursBefore = 2,
                NotifyOwnerOnNewBooking = true
            }
        };

        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            salon.BusinessHours.Add(new BusinessHour
            {
                DayOfWeek = day,
                IsOpen = true,
                OpenTime = new TimeOnly(8, 0),
                CloseTime = new TimeOnly(21, 0)
            });
        }

        var haircutCategory = new ServiceCategory
        {
            Salon = salon,
            PublicId = 1,
            Name = "Haircut",
            SortOrder = 1,
            IsActive = true
        };
        salon.ServiceCategories.Add(haircutCategory);

        var services = new[]
        {
            new Service { Salon = salon, ServiceCategory = haircutCategory, PublicId = 1, Name = "Haircut", DurationMinutes = 40, OriginalPrice = 600, HomeServiceEnabled = true, HomeOriginalPrice = 900, ImageUrl = "assets/images/services/haircut.webp" },
            new Service { Salon = salon, ServiceCategory = haircutCategory, PublicId = 2, Name = "Beard Trim", DurationMinutes = 25, OriginalPrice = 400, HomeServiceEnabled = true, HomeOriginalPrice = 650, ImageUrl = "assets/images/services/beard-trim.webp" },
            new Service { Salon = salon, ServiceCategory = haircutCategory, PublicId = 3, Name = "Hair + Beard + Free Hair Massage", DurationMinutes = 60, OriginalPrice = 1100, HomeServiceEnabled = true, HomeOriginalPrice = 1500, ImageUrl = "assets/images/services/hair-beard-massage.webp" },
            new Service { Salon = salon, ServiceCategory = haircutCategory, PublicId = 4, Name = "Kids Haircut", DurationMinutes = 30, OriginalPrice = 500, HomeServiceEnabled = true, HomeOriginalPrice = 800, ImageUrl = "assets/images/services/kids-haircut.webp" },
            new Service { Salon = salon, ServiceCategory = haircutCategory, PublicId = 5, Name = "Hair Wash", DurationMinutes = 20, OriginalPrice = 300, HomeServiceEnabled = true, HomeOriginalPrice = 500, ImageUrl = "assets/images/services/hair-wash.webp" },
            new Service { Salon = salon, ServiceCategory = haircutCategory, PublicId = 6, Name = "Hair Coloring", DurationMinutes = 75, OriginalPrice = 1800, HomeServiceEnabled = true, HomeOriginalPrice = 2300, ImageUrl = "assets/images/services/hair-color.webp" },
            new Service { Salon = salon, ServiceCategory = haircutCategory, PublicId = 7, Name = "6 Step Face Massage", DurationMinutes = 45, OriginalPrice = 1200, HomeServiceEnabled = true, HomeOriginalPrice = 1600, ImageUrl = "assets/images/services/face-massage.webp" }
        };

        var falak = new Barber
        {
            Salon = salon,
            PublicId = 1,
            FullName = "Falak Shair",
            Phone = "+923001111111",
            Rating = 4.9m,
            ExperienceYears = 8,
            ImageUrl = "assets/images/barber-placeholder.svg"
        };

        var second = new Barber
        {
            Salon = salon,
            PublicId = 2,
            FullName = "Second Barber",
            Phone = "+923002222222",
            Rating = 4.7m,
            ExperienceYears = 5,
            ImageUrl = "assets/images/barber-placeholder.svg"
        };

        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            falak.WorkingHours.Add(new BarberWorkingHour
            {
                DayOfWeek = day,
                IsWorking = true,
                StartTime = new TimeOnly(8, 0),
                EndTime = new TimeOnly(21, 0)
            });
            second.WorkingHours.Add(new BarberWorkingHour
            {
                DayOfWeek = day,
                IsWorking = true,
                StartTime = new TimeOnly(8, 0),
                EndTime = new TimeOnly(21, 0)
            });
        }

        foreach (var service in services)
        {
            falak.Services.Add(new BarberService { Service = service });
            second.Services.Add(new BarberService { Service = service });
        }

            db.Salons.Add(salon);
            db.Services.AddRange(services);
            db.Barbers.AddRange(falak, second);

            await db.SaveChangesAsync(cancellationToken);
        }

        var adminEmail = (configuration["SeedData:AdminEmail"] ?? "").Trim().ToLowerInvariant();
        var adminPassword = configuration["SeedData:AdminPassword"] ?? "";
        var adminName = (configuration["SeedData:AdminName"] ?? "Salon Owner").Trim();

        if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
            return;

        var owner = await db.SalonUsers
            .FirstOrDefaultAsync(
                x => x.SalonId == salon.Id && x.Role == SalonUserRole.Owner,
                cancellationToken);

        owner ??= await db.SalonUsers
            .FirstOrDefaultAsync(
                x => x.SalonId == salon.Id && x.Email.ToLower() == adminEmail,
                cancellationToken);

        if (owner is null)
        {
            owner = new SalonUser
            {
                SalonId = salon.Id,
                FullName = adminName,
                Email = adminEmail,
                Role = SalonUserRole.Owner,
                IsActive = true
            };
            owner.PasswordHash = passwordHasher.HashPassword(owner, adminPassword);
            db.SalonUsers.Add(owner);
            await db.SaveChangesAsync(cancellationToken);
        }
        else if (string.IsNullOrWhiteSpace(owner.PasswordHash))
        {
            // Seed credentials are bootstrap-only. Once an owner has a password,
            // later email/password changes made through the admin portal are preserved.
            owner.PasswordHash = passwordHasher.HashPassword(owner, adminPassword);
            owner.FullName = string.IsNullOrWhiteSpace(owner.FullName) ? adminName : owner.FullName;
            owner.Role = SalonUserRole.Owner;
            owner.IsActive = true;
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}
