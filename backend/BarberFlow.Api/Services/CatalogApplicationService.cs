using System.Globalization;
using BarberFlow.Api.Contracts.Catalog;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Services;

public sealed class CatalogApplicationService(BarberFlowDbContext db)
{
    private const string DefaultSalonSlug = "royal-barbers";

    public async Task<IReadOnlyList<ServiceDto>> GetServicesAsync(CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var services = await db.Services
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .Include(x => x.ServiceCategory)
            .OrderBy(x => x.ServiceCategory.SortOrder)
            .ThenBy(x => x.PublicId)
            .ToListAsync(cancellationToken);

        return services.Select(MapService).ToList();
    }


    public async Task<IReadOnlyList<ServiceCategoryDto>> GetServiceCategoriesAsync(
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);

        return await db.ServiceCategories
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.PublicId)
            .Select(x => new ServiceCategoryDto(
                x.PublicId,
                x.Name,
                x.SortOrder,
                x.IsActive ? "Active" : "Inactive",
                x.Services.Count))
            .ToListAsync(cancellationToken);
    }

    public async Task<MutationResponse<ServiceCategoryDto>> AddServiceCategoryAsync(
        ServiceCategoryUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var validation = ValidateServiceCategory(request);
        if (validation is not null) return new(false, validation);

        var normalizedName = request.Name.Trim();
        var duplicate = await db.ServiceCategories.AnyAsync(
            x => x.SalonId == salonId && x.Name.ToLower() == normalizedName.ToLower(),
            cancellationToken);
        if (duplicate) return new(false, "A service category with this name already exists.");

        var nextId = (await db.ServiceCategories
            .Where(x => x.SalonId == salonId)
            .MaxAsync(x => (int?)x.PublicId, cancellationToken) ?? 0) + 1;

        var category = new ServiceCategory
        {
            SalonId = salonId,
            PublicId = nextId,
            Name = normalizedName,
            SortOrder = request.SortOrder > 0 ? request.SortOrder : nextId,
            IsActive = !request.Status.Equals("Inactive", StringComparison.OrdinalIgnoreCase)
        };

        db.ServiceCategories.Add(category);
        await db.SaveChangesAsync(cancellationToken);

        return new(true, category.Name + " category added successfully.", MapServiceCategory(category));
    }

    public async Task<MutationResponse<ServiceCategoryDto>> UpdateServiceCategoryAsync(
        int publicId,
        ServiceCategoryUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var category = await db.ServiceCategories
            .Include(x => x.Services)
            .FirstOrDefaultAsync(
                x => x.SalonId == salonId && x.PublicId == publicId,
                cancellationToken);
        if (category is null) return new(false, "Service category not found.");

        var validation = ValidateServiceCategory(request);
        if (validation is not null) return new(false, validation);

        var normalizedName = request.Name.Trim();
        var duplicate = await db.ServiceCategories.AnyAsync(
            x => x.SalonId == salonId
                 && x.PublicId != publicId
                 && x.Name.ToLower() == normalizedName.ToLower(),
            cancellationToken);
        if (duplicate) return new(false, "Another service category already uses this name.");

        category.Name = normalizedName;
        category.SortOrder = request.SortOrder > 0 ? request.SortOrder : category.SortOrder;
        category.IsActive = !request.Status.Equals("Inactive", StringComparison.OrdinalIgnoreCase);
        await db.SaveChangesAsync(cancellationToken);

        return new(true, category.Name + " category updated successfully.", MapServiceCategory(category));
    }

    public async Task<MutationResponse<ServiceCategoryDto>> ToggleServiceCategoryStatusAsync(
        int publicId,
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var category = await db.ServiceCategories
            .Include(x => x.Services)
            .FirstOrDefaultAsync(
                x => x.SalonId == salonId && x.PublicId == publicId,
                cancellationToken);
        if (category is null) return new(false, "Service category not found.");

        category.IsActive = !category.IsActive;
        await db.SaveChangesAsync(cancellationToken);

        return new(
            true,
            category.Name + " category is now " + (category.IsActive ? "active." : "inactive."),
            MapServiceCategory(category));
    }

    public async Task<MutationResponse> DeleteServiceCategoryAsync(
        int publicId,
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var category = await db.ServiceCategories
            .Include(x => x.Services)
            .FirstOrDefaultAsync(
                x => x.SalonId == salonId && x.PublicId == publicId,
                cancellationToken);
        if (category is null) return new(false, "Service category not found.");

        if (category.Services.Count > 0)
            return new(false, "Move or delete the services in this category before deleting it.");

        db.ServiceCategories.Remove(category);
        await db.SaveChangesAsync(cancellationToken);
        return new(true, category.Name + " category deleted successfully.");
    }

    public async Task<MutationResponse<ServiceDto>> AddServiceAsync(
        ServiceUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var validation = ValidateService(request);
        if (validation is not null) return new(false, validation);

        var category = await ResolveServiceCategoryAsync(salonId, request.CategoryId, cancellationToken);
        if (category is null) return new(false, "Select a valid service category.");

        var duplicate = await db.Services.AnyAsync(
            x => x.SalonId == salonId && x.Name.ToLower() == request.Name.Trim().ToLower(),
            cancellationToken);
        if (duplicate) return new(false, "A service with this name already exists.");

        var nextId = (await db.Services
            .Where(x => x.SalonId == salonId)
            .MaxAsync(x => (int?)x.PublicId, cancellationToken) ?? 0) + 1;

        var service = BuildService(salonId, nextId, request, category);
        db.Services.Add(service);
        await db.SaveChangesAsync(cancellationToken);

        // Every barber can perform every service configured by the admin.
        // Keep this invariant true for both existing and newly-added barbers.
        await EnsureAllBarbersHaveAllServicesAsync(salonId, cancellationToken);

        return new(true, service.Name + " added successfully.", MapService(service));
    }

    public async Task<MutationResponse<ServiceDto>> UpdateServiceAsync(
        int publicId,
        ServiceUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var service = await db.Services
            .Include(x => x.ServiceCategory)
            .FirstOrDefaultAsync(
                x => x.SalonId == salonId && x.PublicId == publicId,
                cancellationToken);
        if (service is null) return new(false, "Service not found.");

        var validation = ValidateService(request);
        if (validation is not null) return new(false, validation);

        var category = await ResolveServiceCategoryAsync(salonId, request.CategoryId, cancellationToken);
        if (category is null) return new(false, "Select a valid service category.");

        var duplicate = await db.Services.AnyAsync(
            x => x.SalonId == salonId
                 && x.PublicId != publicId
                 && x.Name.ToLower() == request.Name.Trim().ToLower(),
            cancellationToken);
        if (duplicate) return new(false, "Another service already uses this name.");

        ApplyService(service, request, category);
        await db.SaveChangesAsync(cancellationToken);

        return new(true, service.Name + " updated successfully.", MapService(service));
    }

    public async Task<MutationResponse<ServiceDto>> ToggleServiceStatusAsync(
        int publicId,
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var service = await db.Services
            .Include(x => x.ServiceCategory)
            .FirstOrDefaultAsync(
                x => x.SalonId == salonId && x.PublicId == publicId,
                cancellationToken);
        if (service is null) return new(false, "Service not found.");

        service.IsActive = !service.IsActive;
        await db.SaveChangesAsync(cancellationToken);

        return new(
            true,
            service.Name + " is now " + (service.IsActive ? "active." : "inactive."),
            MapService(service));
    }

    public async Task<MutationResponse> DeleteServiceAsync(
        int publicId,
        CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);
        var service = await db.Services.FirstOrDefaultAsync(
            x => x.SalonId == salonId && x.PublicId == publicId,
            cancellationToken);
        if (service is null) return new(false, "Service not found.");

        var today = DateOnly.FromDateTime(GetSalonNow(await GetSalonAsync(cancellationToken)).DateTime);
        var usedByUpcomingBooking = await db.BookingServices.AnyAsync(
            x => x.ServiceId == service.Id
                 && x.Booking.AppointmentDate >= today
                 && (x.Booking.Status == BookingStatus.Pending || x.Booking.Status == BookingStatus.Confirmed),
            cancellationToken);

        if (usedByUpcomingBooking)
            return new(false, "Complete, cancel or move upcoming bookings before deleting this service.");

        var links = await db.BarberServices.Where(x => x.ServiceId == service.Id).ToListAsync(cancellationToken);
        db.BarberServices.RemoveRange(links);
        db.Services.Remove(service);
        await db.SaveChangesAsync(cancellationToken);

        return new(true, service.Name + " deleted successfully.");
    }

    public async Task<IReadOnlyList<BarberDto>> GetBarbersAsync(CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken);

        // Reads stay read-only. Universal barber/service links are maintained when
        // services or barbers are created/updated, not on every customer page load.
        var barbers = await db.Barbers
            .AsNoTracking()
            .AsSplitQuery()
            .Where(x => x.SalonId == salon.Id && !x.IsDeleted)
            .Include(x => x.Services).ThenInclude(x => x.Service)
            .Include(x => x.WorkingHours)
            .Include(x => x.ScheduleOverrides)
            .Include(x => x.Leaves)
            .OrderBy(x => x.PublicId)
            .ToListAsync(cancellationToken);

        var today = DateOnly.FromDateTime(GetSalonNow(salon).DateTime);
        return barbers.Select(x => MapBarber(x, today)).ToList();
    }

    public async Task<MutationResponse<BarberDto>> AddBarberAsync(
        BarberUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken);
        var validation = await ValidateBarberRequestAsync(salon.Id, null, request, cancellationToken);
        if (validation is not null) return new(false, validation);

        var nextId = (await db.Barbers
            .Where(x => x.SalonId == salon.Id)
            .MaxAsync(x => (int?)x.PublicId, cancellationToken) ?? 0) + 1;

        var barber = new Barber
        {
            SalonId = salon.Id,
            PublicId = nextId,
            FullName = request.Name.Trim(),
            Phone = NormalizePhone(request.Phone),
            ExperienceYears = ExperienceYears(request.Experience),
            ImageUrl = request.Image,
            Rating = NormalizeRating(request.Rating),
            IsActive = !request.AccountStatus.Equals("Inactive", StringComparison.OrdinalIgnoreCase),
            IsDeleted = false
        };

        db.Barbers.Add(barber);
        await ApplyBarberServicesAsync(barber, cancellationToken);
        ApplyWorkingHours(barber, request.WorkingHours);
        ApplyImportedAvailability(barber, request, DateOnly.FromDateTime(GetSalonNow(salon).DateTime));

        await db.SaveChangesAsync(cancellationToken);
        await ReloadBarberGraphAsync(barber, cancellationToken);

        return new(true, barber.FullName + " added successfully.", MapBarber(
            barber,
            DateOnly.FromDateTime(GetSalonNow(salon).DateTime)));
    }

    public async Task<MutationResponse<BarberDto>> UpdateBarberAsync(
        int publicId,
        BarberUpsertRequest request,
        CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken);
        var barber = await db.Barbers
            .Include(x => x.Services)
            .Include(x => x.WorkingHours)
            .Include(x => x.ScheduleOverrides)
            .Include(x => x.Leaves)
            .FirstOrDefaultAsync(
                x => x.SalonId == salon.Id && x.PublicId == publicId && !x.IsDeleted,
                cancellationToken);

        if (barber is null) return new(false, "Barber not found.");

        var validation = await ValidateBarberRequestAsync(salon.Id, publicId, request, cancellationToken);
        if (validation is not null) return new(false, validation);

        barber.FullName = request.Name.Trim();
        barber.Phone = NormalizePhone(request.Phone);
        barber.ExperienceYears = ExperienceYears(request.Experience);
        barber.ImageUrl = request.Image;
        barber.Rating = NormalizeRating(request.Rating);

        await SyncBarberServicesAsync(barber, cancellationToken);
        UpdateWorkingHours(barber, request.WorkingHours);

        await db.SaveChangesAsync(cancellationToken);
        await ReloadBarberGraphAsync(barber, cancellationToken);

        return new(true, barber.FullName + " updated successfully.", MapBarber(
            barber,
            DateOnly.FromDateTime(GetSalonNow(salon).DateTime)));
    }

    public async Task<MutationResponse> DeleteBarberAsync(int publicId, CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken);
        var barber = await db.Barbers
            .FirstOrDefaultAsync(
                x => x.SalonId == salon.Id && x.PublicId == publicId && !x.IsDeleted,
                cancellationToken);

        if (barber is null) return new(false, "Barber not found.");

        var today = DateOnly.FromDateTime(GetSalonNow(salon).DateTime);
        var upcoming = await db.Bookings.AnyAsync(
            x => x.BarberId == barber.Id
                 && x.AppointmentDate >= today
                 && (x.Status == BookingStatus.Pending || x.Status == BookingStatus.Confirmed),
            cancellationToken);

        if (upcoming)
            return new(false, "Reassign or cancel upcoming bookings before deleting this barber.");

        // Do not physically delete the row: historical bookings reference this barber
        // with a restrictive foreign key. Soft-delete keeps reports/history accurate
        // while removing the barber from all current customer/admin catalog results.
        barber.IsActive = false;
        barber.IsDeleted = true;
        await db.SaveChangesAsync(cancellationToken);

        return new(true, barber.FullName + " removed from the barber list.");
    }

    public async Task<MutationResponse<BarberDto>> UpdateAvailabilityAsync(
        int publicId,
        string availability,
        CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken);
        var barber = await LoadTrackedBarberAsync(salon.Id, publicId, cancellationToken);
        if (barber is null) return new(false, "Barber not found.");

        var today = DateOnly.FromDateTime(GetSalonNow(salon).DateTime);

        if (availability.Equals("Not Available Today", StringComparison.OrdinalIgnoreCase))
        {
            var hasBooking = await db.Bookings.AnyAsync(
                x => x.BarberId == barber.Id
                     && x.AppointmentDate == today
                     && (x.Status == BookingStatus.Pending || x.Status == BookingStatus.Confirmed),
                cancellationToken);
            if (hasBooking)
                return new(false, barber.FullName + " has active bookings today. Reassign or cancel them first.");

            db.BarberScheduleOverrides.RemoveRange(barber.ScheduleOverrides.Where(x => x.Date == today));
            var scheduleOverride = new BarberScheduleOverride
            {
                BarberId = barber.Id,
                Barber = barber,
                Date = today,
                IsAvailable = false,
                Reason = "Not Available Today"
            };
            barber.ScheduleOverrides.Add(scheduleOverride);
            db.BarberScheduleOverrides.Add(scheduleOverride);
        }
        else if (availability.Equals("Available Today", StringComparison.OrdinalIgnoreCase))
        {
            db.BarberScheduleOverrides.RemoveRange(barber.ScheduleOverrides.Where(x => x.Date == today));
            db.BarberLeaves.RemoveRange(barber.Leaves);
        }
        else
        {
            return new(false, "Use the leave endpoint for leave or vacation dates.");
        }

        await db.SaveChangesAsync(cancellationToken);
        await ReloadBarberGraphAsync(barber, cancellationToken);

        return new(true, barber.FullName + " availability updated.", MapBarber(barber, today));
    }

    public async Task<MutationResponse<BarberDto>> UpdateLeaveAsync(
        int publicId,
        BarberLeaveRequest request,
        CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken);
        var barber = await LoadTrackedBarberAsync(salon.Id, publicId, cancellationToken);
        if (barber is null) return new(false, "Barber not found.");

        if (!DateOnly.TryParse(request.LeaveFrom, out var from)
            || !DateOnly.TryParse(request.LeaveTo, out var to))
            return new(false, "Select both leave start and end dates.");

        if (to < from) return new(false, "Leave end date cannot be before the start date.");

        if (request.Availability is not ("On Leave" or "Vacation"))
            return new(false, "Leave type must be On Leave or Vacation.");

        var hasBookings = await db.Bookings.AnyAsync(
            x => x.BarberId == barber.Id
                 && x.AppointmentDate >= from
                 && x.AppointmentDate <= to
                 && (x.Status == BookingStatus.Pending || x.Status == BookingStatus.Confirmed),
            cancellationToken);

        if (hasBookings)
            return new(false, "Reassign or cancel active bookings during this leave period first.");

        db.BarberLeaves.RemoveRange(barber.Leaves);
        barber.Leaves.Clear();
        var leave = new BarberLeave
        {
            BarberId = barber.Id,
            Barber = barber,
            StartDate = from,
            EndDate = to,
            LeaveType = request.Availability,
            Reason = request.Note?.Trim()
        };
        barber.Leaves.Add(leave);
        db.BarberLeaves.Add(leave);

        await db.SaveChangesAsync(cancellationToken);
        await ReloadBarberGraphAsync(barber, cancellationToken);

        return new(true, barber.FullName + " marked " + request.Availability.ToLowerInvariant() + ".", MapBarber(
            barber,
            DateOnly.FromDateTime(GetSalonNow(salon).DateTime)));
    }

    public async Task<MutationResponse<BarberDto>> ToggleBarberStatusAsync(
        int publicId,
        CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken);
        var barber = await LoadTrackedBarberAsync(salon.Id, publicId, cancellationToken);
        if (barber is null) return new(false, "Barber not found.");

        if (barber.IsActive)
        {
            var today = DateOnly.FromDateTime(GetSalonNow(salon).DateTime);
            var upcoming = await db.Bookings.AnyAsync(
                x => x.BarberId == barber.Id
                     && x.AppointmentDate >= today
                     && (x.Status == BookingStatus.Pending || x.Status == BookingStatus.Confirmed),
                cancellationToken);
            if (upcoming)
                return new(false, "Reassign or cancel upcoming bookings before deactivating this barber.");
        }

        barber.IsActive = !barber.IsActive;
        await db.SaveChangesAsync(cancellationToken);
        await ReloadBarberGraphAsync(barber, cancellationToken);

        return new(
            true,
            barber.FullName + " is now " + (barber.IsActive ? "active." : "inactive."),
            MapBarber(barber, DateOnly.FromDateTime(GetSalonNow(salon).DateTime)));
    }

    public async Task<SettingsDto> GetSettingsAsync(CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken, includeSettings: true);
        return MapSettings(salon);
    }

    public async Task<MutationResponse<SettingsDto>> SaveSettingsAsync(
        SettingsDto request,
        CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken, includeSettings: true);
        var validation = ValidateSettings(request);
        if (validation is not null) return new(false, validation);

        if (BusinessHoursChanged(salon, request))
        {
            var bookingConflict = await ValidateBusinessHoursAgainstActiveBookingsAsync(
                salon,
                request,
                cancellationToken);

            if (bookingConflict is not null)
                return new(false, bookingConflict);
        }

        ApplySettings(salon, request);
        await db.SaveChangesAsync(cancellationToken);

        return new(true, "Settings saved successfully.", MapSettings(salon));
    }

    public async Task<MutationResponse<SettingsDto>> ResetSettingsAsync(CancellationToken cancellationToken)
    {
        var salon = await GetSalonAsync(cancellationToken, includeSettings: true);
        var defaults = DefaultSettings();

        if (BusinessHoursChanged(salon, defaults))
        {
            var bookingConflict = await ValidateBusinessHoursAgainstActiveBookingsAsync(
                salon,
                defaults,
                cancellationToken);

            if (bookingConflict is not null)
                return new(false, bookingConflict);
        }

        ApplySettings(salon, defaults);
        await db.SaveChangesAsync(cancellationToken);
        return new(true, "Settings reset to defaults.", MapSettings(salon));
    }

    public async Task<LegacyImportResponse> ImportLegacyAsync(
        LegacyCatalogImportRequest request,
        CancellationToken cancellationToken)
    {
        var outcome = new LegacyImportResponse(false, false, "Legacy catalog import did not run.");
        var strategy = db.Database.CreateExecutionStrategy();

        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            try
            {
                var salon = await GetSalonAsync(cancellationToken, includeSettings: true);

                if (request.Services is { Count: > 0 })
                {
                    var defaultCategory = await GetOrCreateDefaultServiceCategoryAsync(salon.Id, cancellationToken);
                    var existingServices = await db.Services
                        .Where(x => x.SalonId == salon.Id)
                        .ToListAsync(cancellationToken);

                    var importedServiceIds = new HashSet<Guid>();

                    foreach (var dto in request.Services.OrderBy(x => x.Id))
                    {
                        var upsert = new ServiceUpsertRequest(
                            dto.Name,
                            dto.Duration,
                            dto.OriginalPrice,
                            dto.DiscountPrice,
                            dto.HomeServiceEnabled,
                            dto.HomeOriginalPrice,
                            dto.HomeDiscountPrice,
                            dto.Image,
                            dto.Status,
                            dto.CategoryId);

                        var validation = ValidateService(upsert);
                        if (validation is not null)
                            throw new InvalidOperationException(validation);

                        var service = existingServices.FirstOrDefault(x => x.PublicId == dto.Id)
                            ?? existingServices.FirstOrDefault(
                                x => x.Name.Equals(dto.Name, StringComparison.OrdinalIgnoreCase));

                        if (service is null)
                        {
                            service = BuildService(salon.Id, dto.Id, upsert, defaultCategory);
                            db.Services.Add(service);
                            existingServices.Add(service);
                        }
                        else
                        {
                            service.PublicId = dto.Id;
                            ApplyService(service, upsert, defaultCategory);
                        }

                        importedServiceIds.Add(service.Id);
                    }

                    foreach (var stale in existingServices.Where(x => !importedServiceIds.Contains(x.Id)))
                    {
                        stale.IsActive = false;
                    }

                    await db.SaveChangesAsync(cancellationToken);
                }

                if (request.Barbers is { Count: > 0 })
                {
                    var existingBarbers = await db.Barbers
                        .Where(x => x.SalonId == salon.Id)
                        .Include(x => x.Services)
                        .Include(x => x.WorkingHours)
                        .Include(x => x.ScheduleOverrides)
                        .Include(x => x.Leaves)
                        .ToListAsync(cancellationToken);

                    var importedBarberIds = new HashSet<Guid>();
                    var today = DateOnly.FromDateTime(GetSalonNow(salon).DateTime);

                    foreach (var dto in request.Barbers.OrderBy(x => x.Id))
                    {
                        var normalizedPhone = NormalizePhone(dto.Phone);
                        var barber = existingBarbers.FirstOrDefault(x => x.PublicId == dto.Id)
                            ?? existingBarbers.FirstOrDefault(
                                x => string.Equals(x.Phone, normalizedPhone, StringComparison.OrdinalIgnoreCase))
                            ?? existingBarbers.FirstOrDefault(
                                x => x.FullName.Equals(dto.Name, StringComparison.OrdinalIgnoreCase));

                        if (barber is null)
                        {
                            barber = new Barber
                            {
                                SalonId = salon.Id,
                                PublicId = dto.Id,
                                FullName = dto.Name.Trim(),
                                Phone = normalizedPhone,
                                ExperienceYears = ExperienceYears(dto.Experience),
                                ImageUrl = dto.Image,
                                Rating = NormalizeRating(dto.Rating),
                                IsActive = !dto.AccountStatus.Equals("Inactive", StringComparison.OrdinalIgnoreCase)
                            };

                            db.Barbers.Add(barber);
                            existingBarbers.Add(barber);
                        }
                        else
                        {
                            barber.PublicId = dto.Id;
                            barber.FullName = dto.Name.Trim();
                            barber.Phone = normalizedPhone;
                            barber.ExperienceYears = ExperienceYears(dto.Experience);
                            barber.ImageUrl = dto.Image;
                            barber.Rating = NormalizeRating(dto.Rating);
                            barber.IsActive = !dto.AccountStatus.Equals("Inactive", StringComparison.OrdinalIgnoreCase);
                            barber.IsDeleted = false;

                            db.BarberServices.RemoveRange(barber.Services);
                            barber.Services.Clear();
                            db.BarberWorkingHours.RemoveRange(barber.WorkingHours);
                            barber.WorkingHours.Clear();
                            db.BarberScheduleOverrides.RemoveRange(barber.ScheduleOverrides);
                            barber.ScheduleOverrides.Clear();
                            db.BarberLeaves.RemoveRange(barber.Leaves);
                            barber.Leaves.Clear();
                        }

                        await ApplyBarberServicesAsync(barber, cancellationToken);
                        ApplyWorkingHours(barber, dto.WorkingHours);
                        ApplyImportedAvailability(
                            barber,
                            new BarberUpsertRequest(
                                dto.Name,
                                dto.Phone,
                                dto.Experience,
                                dto.Specialties,
                                dto.WorkingHours,
                                dto.Image,
                                dto.Rating,
                                dto.Availability,
                                dto.AccountStatus,
                                dto.LeaveFrom,
                                dto.LeaveTo,
                                dto.Note),
                            today);

                        importedBarberIds.Add(barber.Id);
                    }

                    foreach (var stale in existingBarbers.Where(x => !importedBarberIds.Contains(x.Id)))
                    {
                        stale.IsActive = false;
                    }

                    await db.SaveChangesAsync(cancellationToken);
                }

                var settingsMessage = "";
                if (request.Settings is not null)
                {
                    var validation = ValidateSettings(request.Settings);
                    if (validation is null)
                    {
                        ApplySettings(salon, request.Settings);
                        await db.SaveChangesAsync(cancellationToken);
                    }
                    else
                    {
                        settingsMessage = " Existing browser settings were not imported because: " + validation;
                    }
                }

                await transaction.CommitAsync(cancellationToken);

                outcome = new LegacyImportResponse(
                    true,
                    true,
                    "Legacy Services, Barbers and Settings were migrated to SQL Server." + settingsMessage);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync(cancellationToken);
                db.ChangeTracker.Clear();
                outcome = new LegacyImportResponse(
                    false,
                    false,
                    "Legacy data migration failed: " + ex.Message);
            }
        });

        return outcome;
    }

    private static ServiceDto MapService(Service service) => new(
        service.PublicId,
        service.Name,
        service.DurationMinutes,
        service.OriginalPrice,
        service.DiscountPrice,
        service.HomeServiceEnabled,
        service.HomeOriginalPrice,
        service.HomeDiscountPrice,
        service.ImageUrl ?? "assets/images/service-placeholder.svg",
        service.IsActive ? "Active" : "Inactive",
        service.ServiceCategory?.PublicId,
        service.ServiceCategory?.Name);

    private static ServiceCategoryDto MapServiceCategory(ServiceCategory category) => new(
        category.PublicId,
        category.Name,
        category.SortOrder,
        category.IsActive ? "Active" : "Inactive",
        category.Services.Count);

    private static Service BuildService(
        Guid salonId,
        int publicId,
        ServiceUpsertRequest request,
        ServiceCategory category)
    {
        var service = new Service
        {
            SalonId = salonId,
            PublicId = publicId,
            Name = request.Name.Trim(),
            ServiceCategoryId = category.Id,
            ServiceCategory = category
        };
        ApplyService(service, request, category);
        return service;
    }

    private static void ApplyService(
        Service service,
        ServiceUpsertRequest request,
        ServiceCategory category)
    {
        service.ServiceCategoryId = category.Id;
        service.ServiceCategory = category;
        service.Name = request.Name.Trim();
        service.DurationMinutes = request.Duration;
        service.OriginalPrice = request.OriginalPrice;
        service.DiscountPrice = request.DiscountPrice;
        service.HomeServiceEnabled = request.HomeServiceEnabled;
        service.HomeOriginalPrice = request.HomeServiceEnabled ? request.HomeOriginalPrice : null;
        service.HomeDiscountPrice = request.HomeServiceEnabled ? request.HomeDiscountPrice : null;
        service.ImageUrl = request.Image;
        service.IsActive = !request.Status.Equals("Inactive", StringComparison.OrdinalIgnoreCase);
    }

    private static string? ValidateService(ServiceUpsertRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Service name is required.";
        if (request.Duration <= 0) return "Enter a valid service duration.";
        if (request.OriginalPrice <= 0) return "Enter a valid original amount.";
        if (request.DiscountPrice is not null
            && (request.DiscountPrice <= 0 || request.DiscountPrice >= request.OriginalPrice))
            return "Discount amount must be greater than 0 and lower than the original amount.";
        if (request.HomeServiceEnabled
            && (!request.HomeOriginalPrice.HasValue || request.HomeOriginalPrice <= 0))
            return "Enter a valid home service amount.";
        if (request.HomeServiceEnabled && request.HomeDiscountPrice is not null
            && (request.HomeDiscountPrice <= 0 || request.HomeDiscountPrice >= request.HomeOriginalPrice))
            return "Home discount amount must be greater than 0 and lower than the home service amount.";
        if (string.IsNullOrWhiteSpace(request.Image)) return "Service image is required.";
        return null;
    }

    private static string? ValidateServiceCategory(ServiceCategoryUpsertRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Category name is required.";
        if (request.Name.Trim().Length > 120) return "Category name cannot exceed 120 characters.";
        if (request.SortOrder < 0) return "Category display order cannot be negative.";
        return null;
    }

    private async Task<ServiceCategory?> ResolveServiceCategoryAsync(
        Guid salonId,
        int? publicId,
        CancellationToken cancellationToken)
    {
        if (!publicId.HasValue || publicId.Value <= 0)
            return await GetOrCreateDefaultServiceCategoryAsync(salonId, cancellationToken);

        return await db.ServiceCategories.FirstOrDefaultAsync(
            x => x.SalonId == salonId && x.PublicId == publicId.Value,
            cancellationToken);
    }

    private async Task<ServiceCategory> GetOrCreateDefaultServiceCategoryAsync(
        Guid salonId,
        CancellationToken cancellationToken)
    {
        var category = await db.ServiceCategories.FirstOrDefaultAsync(
            x => x.SalonId == salonId && x.Name.ToLower() == "haircut",
            cancellationToken);

        if (category is not null) return category;

        var nextId = (await db.ServiceCategories
            .Where(x => x.SalonId == salonId)
            .MaxAsync(x => (int?)x.PublicId, cancellationToken) ?? 0) + 1;

        category = new ServiceCategory
        {
            SalonId = salonId,
            PublicId = nextId,
            Name = "Haircut",
            SortOrder = 1,
            IsActive = true
        };
        db.ServiceCategories.Add(category);
        await db.SaveChangesAsync(cancellationToken);
        return category;
    }

    private async Task<string?> ValidateBarberRequestAsync(
        Guid salonId,
        int? publicId,
        BarberUpsertRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return "Barber name is required.";
        if (!IsValidPakistanPhone(request.Phone)) return "Enter a valid Pakistan mobile number.";
        if (!string.IsNullOrWhiteSpace(request.WorkingHours)
            && !TryParseWorkingHours(request.WorkingHours, out _, out _))
            return "Enter working hours like 8:00 AM - 9:00 PM, or leave it blank to use salon hours.";

        var duplicateName = await db.Barbers.AnyAsync(
            x => x.SalonId == salonId
                 && !x.IsDeleted
                 && (!publicId.HasValue || x.PublicId != publicId.Value)
                 && x.FullName.ToLower() == request.Name.Trim().ToLower(),
            cancellationToken);
        if (duplicateName) return "Another barber already uses this name.";

        var normalizedPhone = NormalizePhone(request.Phone);
        var duplicatePhone = await db.Barbers.AnyAsync(
            x => x.SalonId == salonId
                 && !x.IsDeleted
                 && (!publicId.HasValue || x.PublicId != publicId.Value)
                 && x.Phone == normalizedPhone,
            cancellationToken);
        if (duplicatePhone) return "Another barber already uses this mobile number.";

        return null;
    }

    private async Task ApplyBarberServicesAsync(
        Barber barber,
        CancellationToken cancellationToken)
    {
        var services = await db.Services
            .Where(x => x.SalonId == barber.SalonId)
            .ToListAsync(cancellationToken);

        foreach (var service in services)
        {
            var link = new BarberService
            {
                BarberId = barber.Id,
                Barber = barber,
                ServiceId = service.Id,
                Service = service
            };
            barber.Services.Add(link);
            db.BarberServices.Add(link);
        }
    }

    private async Task SyncBarberServicesAsync(
        Barber barber,
        CancellationToken cancellationToken)
    {
        var services = await db.Services
            .Where(x => x.SalonId == barber.SalonId)
            .ToListAsync(cancellationToken);

        var desiredServiceIds = services.Select(x => x.Id).ToHashSet();
        var removedLinks = barber.Services
            .Where(x => !desiredServiceIds.Contains(x.ServiceId))
            .ToList();

        db.BarberServices.RemoveRange(removedLinks);
        foreach (var link in removedLinks)
            barber.Services.Remove(link);

        var existingServiceIds = barber.Services.Select(x => x.ServiceId).ToHashSet();
        foreach (var service in services.Where(x => !existingServiceIds.Contains(x.Id)))
        {
            var link = new BarberService
            {
                BarberId = barber.Id,
                Barber = barber,
                ServiceId = service.Id,
                Service = service
            };
            barber.Services.Add(link);
            db.BarberServices.Add(link);
        }
    }

    private async Task EnsureAllBarbersHaveAllServicesAsync(
        Guid salonId,
        CancellationToken cancellationToken)
    {
        var serviceIds = await db.Services
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);

        if (serviceIds.Count == 0) return;

        var barbers = await db.Barbers
            .Where(x => x.SalonId == salonId && !x.IsDeleted)
            .Include(x => x.Services)
            .ToListAsync(cancellationToken);

        var changed = false;

        foreach (var barber in barbers)
        {
            var existingServiceIds = barber.Services.Select(x => x.ServiceId).ToHashSet();

            foreach (var serviceId in serviceIds.Where(id => !existingServiceIds.Contains(id)))
            {
                db.BarberServices.Add(new BarberService
                {
                    BarberId = barber.Id,
                    ServiceId = serviceId
                });
                changed = true;
            }
        }

        if (changed)
            await db.SaveChangesAsync(cancellationToken);

        db.ChangeTracker.Clear();
    }

    private void UpdateWorkingHours(Barber barber, string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            db.BarberWorkingHours.RemoveRange(barber.WorkingHours);
            barber.WorkingHours.Clear();
            return;
        }

        if (!TryParseWorkingHours(value, out var start, out var end))
            throw new InvalidOperationException("Invalid barber working hours.");

        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            var existing = barber.WorkingHours.FirstOrDefault(x => x.DayOfWeek == day);
            if (existing is null)
            {
                var workingHour = new BarberWorkingHour
                {
                    BarberId = barber.Id,
                    Barber = barber,
                    DayOfWeek = day,
                    IsWorking = true,
                    StartTime = start,
                    EndTime = end
                };
                barber.WorkingHours.Add(workingHour);
                db.BarberWorkingHours.Add(workingHour);
                continue;
            }

            existing.IsWorking = true;
            existing.StartTime = start;
            existing.EndTime = end;
        }
    }

    private void ApplyWorkingHours(Barber barber, string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;

        if (!TryParseWorkingHours(value, out var start, out var end))
            throw new InvalidOperationException("Invalid barber working hours.");

        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            var workingHour = new BarberWorkingHour
            {
                BarberId = barber.Id,
                Barber = barber,
                DayOfWeek = day,
                IsWorking = true,
                StartTime = start,
                EndTime = end
            };
            barber.WorkingHours.Add(workingHour);
            db.BarberWorkingHours.Add(workingHour);
        }
    }

    private void ApplyImportedAvailability(
        Barber barber,
        BarberUpsertRequest request,
        DateOnly today)
    {
        if (request.Availability.Equals("Not Available Today", StringComparison.OrdinalIgnoreCase))
        {
            var scheduleOverride = new BarberScheduleOverride
            {
                BarberId = barber.Id,
                Barber = barber,
                Date = today,
                IsAvailable = false,
                Reason = "Not Available Today"
            };
            barber.ScheduleOverrides.Add(scheduleOverride);
            db.BarberScheduleOverrides.Add(scheduleOverride);
        }

        if ((request.Availability.Equals("On Leave", StringComparison.OrdinalIgnoreCase)
             || request.Availability.Equals("Vacation", StringComparison.OrdinalIgnoreCase))
            && DateOnly.TryParse(request.LeaveFrom, out var from)
            && DateOnly.TryParse(request.LeaveTo, out var to))
        {
            var leave = new BarberLeave
            {
                BarberId = barber.Id,
                Barber = barber,
                StartDate = from,
                EndDate = to,
                LeaveType = request.Availability,
                Reason = request.Note?.Trim()
            };
            barber.Leaves.Add(leave);
            db.BarberLeaves.Add(leave);
        }
    }

    private static BarberDto MapBarber(Barber barber, DateOnly today)
    {
        var leave = barber.Leaves
            .OrderByDescending(x => x.EndDate >= today)
            .ThenBy(x => x.StartDate)
            .FirstOrDefault();

        var unavailableToday = barber.ScheduleOverrides.Any(x => x.Date == today && !x.IsAvailable);

        var availability = !barber.IsActive
            ? "Not Available Today"
            : leave is not null && today >= leave.StartDate && today <= leave.EndDate
                ? leave.LeaveType
                : unavailableToday
                    ? "Not Available Today"
                    : "Available Today";

        var work = barber.WorkingHours
            .Where(x => x.IsWorking && x.StartTime.HasValue && x.EndTime.HasValue)
            .OrderBy(x => x.DayOfWeek)
            .FirstOrDefault();

        var workingHours = work is null
            ? ""
            : FormatTime(work.StartTime!.Value) + " - " + FormatTime(work.EndTime!.Value);

        return new BarberDto(
            barber.PublicId,
            barber.FullName,
            FormatPhone(barber.Phone),
            barber.ExperienceYears is > 0 ? barber.ExperienceYears.Value + "+ years" : "New",
            barber.Services.Select(x => x.Service.Name).OrderBy(x => x).ToList(),
            workingHours,
            barber.ImageUrl ?? "assets/images/barber-placeholder.svg",
            barber.Rating,
            availability,
            barber.IsActive ? "Active" : "Inactive",
            leave?.StartDate.ToString("yyyy-MM-dd"),
            leave?.EndDate.ToString("yyyy-MM-dd"),
            leave?.Reason ?? "");
    }

    private async Task<Barber?> LoadTrackedBarberAsync(
        Guid salonId,
        int publicId,
        CancellationToken cancellationToken)
        => await db.Barbers
            .Include(x => x.Services).ThenInclude(x => x.Service)
            .Include(x => x.WorkingHours)
            .Include(x => x.ScheduleOverrides)
            .Include(x => x.Leaves)
            .FirstOrDefaultAsync(
                x => x.SalonId == salonId && x.PublicId == publicId && !x.IsDeleted,
                cancellationToken);

    private async Task ReloadBarberGraphAsync(Barber barber, CancellationToken cancellationToken)
    {
        await db.Entry(barber).Collection(x => x.Services).Query().Include(x => x.Service).LoadAsync(cancellationToken);
        await db.Entry(barber).Collection(x => x.WorkingHours).LoadAsync(cancellationToken);
        await db.Entry(barber).Collection(x => x.ScheduleOverrides).LoadAsync(cancellationToken);
        await db.Entry(barber).Collection(x => x.Leaves).LoadAsync(cancellationToken);
    }

    private static SettingsDto MapSettings(Salon salon)
    {
        var settings = salon.Settings ?? new SalonSettings { SalonId = salon.Id };
        var hours = Enum.GetValues<DayOfWeek>()
            .Select(day =>
            {
                var saved = salon.BusinessHours.FirstOrDefault(x => x.DayOfWeek == day);
                return new BusinessHoursDayDto(
                    day.ToString().ToLowerInvariant(),
                    day.ToString(),
                    saved?.IsOpen == true,
                    saved?.OpenTime?.ToString("HH:mm") ?? "08:00",
                    saved?.CloseTime?.ToString("HH:mm") ?? "21:00");
            })
            .OrderBy(x => DayOrder(x.Key))
            .ToList();

        return new SettingsDto(
            salon.Name,
            FormatPhone(salon.Phone),
            FormatPhone(salon.WhatsAppNumber),
            salon.Email ?? "",
            salon.Address ?? "",
            salon.City ?? "",
            salon.CurrencyCode,
            salon.TimeZone,
            settings.BrandSubtitle,
            settings.HeroEyebrow,
            settings.HeroHeadline,
            settings.HeroTagline,
            settings.BookingIntervalMinutes,
            settings.MaxAdvanceDays,
            settings.CancellationHours,
            settings.LateArrivalMinutes,
            settings.AllowSameDayBooking,
            settings.AutoConfirmBookings,
            settings.SendWhatsappConfirmation,
            settings.SendSmsFallback,
            settings.SendAppointmentReminder,
            settings.ReminderHoursBefore,
            settings.NotifyOwnerOnNewBooking,
            hours);
    }

    private static SettingsDto DefaultSettings() => new(
        "Royal Barbers",
        "+92 300 1234567",
        "+92 300 1234567",
        "owner@royalbarbers.local",
        "",
        "",
        "PKR",
        "Asia/Karachi",
        "LOOK GOOD · FEEL GREAT",
        "PREMIUM BARBERSHOP",
        "",
        "More Than a Haircut. It's a Lifestyle.",
        30,
        30,
        2,
        10,
        true,
        true,
        false,
        false,
        false,
        2,
        true,
        Enum.GetValues<DayOfWeek>()
            .Select(day => new BusinessHoursDayDto(
                day.ToString().ToLowerInvariant(),
                day.ToString(),
                true,
                "08:00",
                "21:00"))
            .OrderBy(x => DayOrder(x.Key))
            .ToList());

    private static void ApplySettings(Salon salon, SettingsDto request)
    {
        salon.Name = request.BusinessName.Trim();
        salon.Phone = NormalizePhone(request.BusinessPhone);
        salon.WhatsAppNumber = NormalizePhone(request.WhatsappNumber);
        salon.Email = request.Email.Trim();
        salon.Address = request.Address.Trim();
        salon.City = request.City.Trim();
        salon.CurrencyCode = request.Currency.Trim().ToUpperInvariant();
        salon.TimeZone = request.Timezone.Trim();

        salon.Settings ??= new SalonSettings { SalonId = salon.Id };
        salon.Settings.BookingIntervalMinutes = request.BookingInterval;
        salon.Settings.MaxAdvanceDays = request.MaxAdvanceDays;
        salon.Settings.CancellationHours = request.CancellationHours;
        salon.Settings.LateArrivalMinutes = request.LateArrivalMinutes;
        salon.Settings.AllowSameDayBooking = request.AllowSameDayBooking;
        salon.Settings.AutoConfirmBookings = request.AutoConfirmBookings;
        salon.Settings.BrandSubtitle = request.BrandSubtitle.Trim();
        salon.Settings.HeroEyebrow = request.HeroEyebrow.Trim();
        salon.Settings.HeroHeadline = request.HeroHeadline.Trim();
        salon.Settings.HeroTagline = request.HeroTagline.Trim();
        salon.Settings.SendWhatsappConfirmation = request.SendWhatsappConfirmation;
        salon.Settings.SendSmsFallback = request.SendSmsFallback;
        salon.Settings.SendAppointmentReminder = request.SendAppointmentReminder;
        salon.Settings.ReminderHoursBefore = request.ReminderHoursBefore;
        salon.Settings.NotifyOwnerOnNewBooking = request.NotifyOwnerOnNewBooking;

        var byKey = request.BusinessHours.ToDictionary(x => x.Key.ToLowerInvariant());
        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            var key = day.ToString().ToLowerInvariant();
            if (!byKey.TryGetValue(key, out var incoming)) continue;

            var entity = salon.BusinessHours.FirstOrDefault(x => x.DayOfWeek == day);
            if (entity is null)
            {
                entity = new BusinessHour { SalonId = salon.Id, DayOfWeek = day };
                salon.BusinessHours.Add(entity);
            }

            entity.IsOpen = incoming.Enabled;
            entity.OpenTime = TimeOnly.TryParseExact(incoming.Open, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var open)
                ? open : null;
            entity.CloseTime = TimeOnly.TryParseExact(incoming.Close, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var close)
                ? close : null;
        }
    }

    private static string? ValidateSettings(SettingsDto request)
    {
        if (string.IsNullOrWhiteSpace(request.BusinessName)) return "Business name is required.";
        if (request.BusinessName.Trim().Length > 160) return "Business name must be 160 characters or fewer.";
        if (!IsValidPakistanPhone(request.BusinessPhone)) return "Enter a valid Pakistan business phone number.";
        if (!IsValidPakistanPhone(request.WhatsappNumber)) return "Enter a valid Pakistan WhatsApp number.";

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            if (request.Email.Trim().Length > 254
                || !request.Email.Contains('@')
                || request.Email.StartsWith('@')
                || request.Email.EndsWith('@'))
                return "Enter a valid email address.";
        }

        if (request.Address?.Trim().Length > 500) return "Address must be 500 characters or fewer.";
        if (request.City?.Trim().Length > 120) return "City must be 120 characters or fewer.";

        var currency = request.Currency?.Trim().ToUpperInvariant() ?? "";
        if (currency.Length != 3) return "Currency must use a 3-letter code.";

        if (string.IsNullOrWhiteSpace(request.Timezone) || !IsValidTimeZone(request.Timezone.Trim()))
            return "Select a valid timezone.";

        if (request.BrandSubtitle?.Trim().Length > 60) return "Header subtitle must be 60 characters or fewer.";
        if (request.HeroEyebrow?.Trim().Length > 60) return "Hero eyebrow text must be 60 characters or fewer.";
        if (request.HeroHeadline?.Trim().Length > 90) return "Hero headline must be 90 characters or fewer.";
        if (request.HeroTagline?.Trim().Length > 140) return "Hero tagline must be 140 characters or fewer.";

        if (request.BookingInterval < 5 || request.BookingInterval > 240)
            return "Booking interval must be from 5 to 240 minutes.";
        if (request.MaxAdvanceDays < 1 || request.MaxAdvanceDays > 365)
            return "Advance booking window must be from 1 to 365 days.";
        if (request.CancellationHours < 0 || request.CancellationHours > 168)
            return "Cancellation notice must be from 0 to 168 hours.";
        if (request.LateArrivalMinutes < 0 || request.LateArrivalMinutes > 240)
            return "Late arrival grace must be from 0 to 240 minutes.";

        if (request.SendAppointmentReminder
            && (request.ReminderHoursBefore < 1 || request.ReminderHoursBefore > 72))
            return "Reminder time must be from 1 to 72 hours.";

        if (request.BusinessHours is null || request.BusinessHours.Count != 7)
            return "Business hours must contain all seven days.";

        var validKeys = Enum.GetValues<DayOfWeek>()
            .Select(x => x.ToString().ToLowerInvariant())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var normalizedKeys = request.BusinessHours
            .Select(x => (x.Key ?? "").Trim().ToLowerInvariant())
            .ToList();

        if (normalizedKeys.Any(string.IsNullOrWhiteSpace)
            || normalizedKeys.Any(key => !validKeys.Contains(key))
            || normalizedKeys.Distinct(StringComparer.OrdinalIgnoreCase).Count() != 7)
            return "Business hours contain an invalid or duplicate weekday.";

        foreach (var day in request.BusinessHours.Where(x => x.Enabled))
        {
            if (!TimeOnly.TryParseExact(day.Open, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var open)
                || !TimeOnly.TryParseExact(day.Close, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var close)
                || close <= open)
                return day.Label + " closing time must be later than opening time.";
        }

        return null;
    }

    private static bool BusinessHoursChanged(Salon salon, SettingsDto request)
    {
        var byKey = request.BusinessHours.ToDictionary(
            x => x.Key.Trim().ToLowerInvariant(),
            StringComparer.OrdinalIgnoreCase);

        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            var key = day.ToString().ToLowerInvariant();
            if (!byKey.TryGetValue(key, out var incoming)) return true;

            var saved = salon.BusinessHours.FirstOrDefault(x => x.DayOfWeek == day);
            if (saved is null || saved.IsOpen != incoming.Enabled) return true;

            if (!incoming.Enabled) continue;

            if (!TimeOnly.TryParseExact(incoming.Open, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var open)
                || !TimeOnly.TryParseExact(incoming.Close, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var close)
                || saved.OpenTime != open
                || saved.CloseTime != close)
                return true;
        }

        return false;
    }

    private async Task<string?> ValidateBusinessHoursAgainstActiveBookingsAsync(
        Salon salon,
        SettingsDto request,
        CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(GetSalonNow(salon).DateTime);
        var hoursByKey = request.BusinessHours.ToDictionary(
            x => x.Key.Trim().ToLowerInvariant(),
            StringComparer.OrdinalIgnoreCase);

        var activeBookings = await db.Bookings
            .AsNoTracking()
            .Where(x => x.SalonId == salon.Id
                        && x.AppointmentDate >= today
                        && (x.Status == BookingStatus.Pending || x.Status == BookingStatus.Confirmed))
            .OrderBy(x => x.AppointmentDate)
            .ThenBy(x => x.StartTime)
            .Select(x => new
            {
                x.BookingCode,
                x.AppointmentDate,
                x.StartTime,
                x.TotalDurationMinutes
            })
            .ToListAsync(cancellationToken);

        foreach (var booking in activeBookings)
        {
            var key = booking.AppointmentDate.DayOfWeek.ToString().ToLowerInvariant();
            if (!hoursByKey.TryGetValue(key, out var day) || !day.Enabled)
            {
                return $"Cannot close {booking.AppointmentDate:dddd} while active booking {booking.BookingCode} exists on {booking.AppointmentDate:dd MMM yyyy}.";
            }

            if (!TimeOnly.TryParseExact(day.Open, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var open)
                || !TimeOnly.TryParseExact(day.Close, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var close))
                continue;

            var bookingStart = booking.StartTime.Hour * 60 + booking.StartTime.Minute;
            var bookingEnd = bookingStart + booking.TotalDurationMinutes;
            var opening = open.Hour * 60 + open.Minute;
            var closing = close.Hour * 60 + close.Minute;

            if (bookingStart < opening || bookingEnd > closing)
            {
                return $"Business hours would exclude active booking {booking.BookingCode} on {booking.AppointmentDate:dd MMM yyyy} at {booking.StartTime.ToString("h:mm tt", CultureInfo.InvariantCulture)}. Reschedule or cancel that booking first.";
            }
        }

        return null;
    }

    private static bool IsValidTimeZone(string value)
    {
        try
        {
            _ = TimeZoneInfo.FindSystemTimeZoneById(value);
            return true;
        }
        catch (TimeZoneNotFoundException)
        {
            return false;
        }
        catch (InvalidTimeZoneException)
        {
            return false;
        }
    }

    private async Task<Salon> GetSalonAsync(
        CancellationToken cancellationToken,
        bool includeSettings = false)
    {
        IQueryable<Salon> query = db.Salons
            .Where(x => x.Slug == DefaultSalonSlug && x.IsActive);

        if (includeSettings)
            query = query.Include(x => x.Settings).Include(x => x.BusinessHours);

        return await query.FirstAsync(cancellationToken);
    }

    private async Task<Guid> GetSalonIdAsync(CancellationToken cancellationToken)
        => (await GetSalonAsync(cancellationToken)).Id;

    private static bool TryParseWorkingHours(string value, out TimeOnly start, out TimeOnly end)
    {
        start = default;
        end = default;

        var normalized = (value ?? "")
            .Replace("–", "-")
            .Replace("—", "-")
            .Trim();

        var parts = normalized.Split('-', 2, StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return false;

        return TryParseShiftTime(parts[0], out start)
               && TryParseShiftTime(parts[1], out end)
               && end > start;
    }

    private static bool TryParseShiftTime(string value, out TimeOnly time)
    {
        var formats = new[] { "h tt", "h:mm tt", "hh:mm tt", "HH:mm" };
        return TimeOnly.TryParseExact(
            value.Trim(),
            formats,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces,
            out time);
    }

    private static string FormatTime(TimeOnly value)
        => DateTime.Today.Add(value.ToTimeSpan()).ToString("h:mm tt", CultureInfo.InvariantCulture);

    private static int ExperienceYears(string value)
        => int.TryParse(new string((value ?? "").TakeWhile(char.IsDigit).ToArray()), out var years)
            ? Math.Max(0, years)
            : 0;

    private static decimal NormalizeRating(decimal rating)
        => Math.Clamp(rating <= 0 ? 5m : rating, 1m, 5m);

    private static bool IsValidPakistanPhone(string value)
    {
        var digits = new string((value ?? "").Where(char.IsDigit).ToArray());
        if (digits.StartsWith("92")) digits = digits[2..];
        return digits.Length == 10 && digits.StartsWith("3");
    }

    private static string NormalizePhone(string? value)
    {
        var digits = new string((value ?? "").Where(char.IsDigit).ToArray());
        if (digits.StartsWith("92")) digits = digits[2..];
        return digits.Length == 10 ? "+92" + digits : value?.Trim() ?? "";
    }

    private static string FormatPhone(string? value)
    {
        var digits = new string((value ?? "").Where(char.IsDigit).ToArray());
        if (digits.StartsWith("92")) digits = digits[2..];
        return digits.Length == 10
            ? "+92 " + digits[..3] + " " + digits[3..]
            : value ?? "";
    }

    private static int DayOrder(string key) => key switch
    {
        "monday" => 1,
        "tuesday" => 2,
        "wednesday" => 3,
        "thursday" => 4,
        "friday" => 5,
        "saturday" => 6,
        "sunday" => 7,
        _ => 8
    };

    private static DateTimeOffset GetSalonNow(Salon salon)
    {
        try
        {
            return TimeZoneInfo.ConvertTime(
                DateTimeOffset.UtcNow,
                TimeZoneInfo.FindSystemTimeZoneById(salon.TimeZone));
        }
        catch
        {
            return DateTimeOffset.UtcNow;
        }
    }
}
