using System.Data;
using System.Globalization;
using BarberFlow.Api.Contracts.Bookings;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Services;

public sealed class BookingApplicationService(
    BarberFlowDbContext db,
    WhatsAppMessagingService whatsAppMessaging)
{
    private const string DefaultSalonSlug = "ladies-salon";
    private const int CustomHomeServiceDurationMinutes = 60;

    public async Task<IReadOnlyList<BookingResponse>> GetAllAsync(CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);

        var bookings = await db.Bookings
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .Include(x => x.Barber)
            .Include(x => x.Services)
            .OrderByDescending(x => x.AppointmentDate)
            .ThenByDescending(x => x.StartTime)
            .ToListAsync(cancellationToken);

        return bookings.Select(Map).ToList();
    }

    public async Task<IReadOnlyList<BookingBusySlotResponse>> GetBusySlotsAsync(
        CancellationToken cancellationToken)
    {
        var salon = await db.Salons
            .AsNoTracking()
            .FirstAsync(x => x.Slug == DefaultSalonSlug && x.IsActive, cancellationToken);

        var today = DateOnly.FromDateTime(GetSalonNow(salon).DateTime);
        var bookings = await db.Bookings
            .AsNoTracking()
            .Where(x => x.SalonId == salon.Id
                        && x.AppointmentDate >= today
                        && x.Status != BookingStatus.Cancelled)
            .Include(x => x.Barber)
            .OrderBy(x => x.AppointmentDate)
            .ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);

        return bookings.Select(x => new BookingBusySlotResponse(
            x.PublicId,
            x.Barber.FullName,
            x.AppointmentDate.ToString("yyyy-MM-dd"),
            x.StartTime.ToString("h:mm tt"),
            x.TotalDurationMinutes,
            x.Status.ToString()
        )).ToList();
    }

    public async Task<BookingResponse?> GetByPublicIdAsync(int id, CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);

        var booking = await db.Bookings
            .AsNoTracking()
            .Include(x => x.Barber)
            .Include(x => x.Services)
            .FirstOrDefaultAsync(x => x.SalonId == salonId && x.PublicId == id, cancellationToken);

        return booking is null ? null : Map(booking);
    }

    public async Task<BookingMutationResponse> CreateAsync(
        BookingRequest request,
        BookingSource source,
        CancellationToken cancellationToken)
    {
        var results = await CreateManyAsync([request], source, cancellationToken);
        return results;
    }

    public async Task<BookingMutationResponse> CreateManyAsync(
        IReadOnlyList<BookingRequest> requests,
        BookingSource source,
        CancellationToken cancellationToken)
    {
        if (requests.Count == 0)
            return new(false, "No booking details were provided.");

        var strategy = db.Database.CreateExecutionStrategy();

        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);

            var salon = await db.Salons
                .Include(x => x.Settings)
                .FirstOrDefaultAsync(
                    x => x.Slug == DefaultSalonSlug && x.IsActive,
                    cancellationToken);

            if (salon is null)
            {
                await transaction.RollbackAsync(cancellationToken);
                return new BookingMutationResponse(false, "Salon configuration was not found.");
            }

            var nextPublicId = (await db.Bookings
                .Where(x => x.SalonId == salon.Id)
                .MaxAsync(x => (int?)x.PublicId, cancellationToken) ?? 0) + 1;

            Booking? firstCreated = null;
            var staged = new List<Booking>();

            foreach (var request in requests)
            {
                var validation = await ValidateAndBuildAsync(
                    salon,
                    request,
                    source,
                    nextPublicId++,
                    staged,
                    cancellationToken);

                if (!validation.Success)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    db.ChangeTracker.Clear();
                    return new BookingMutationResponse(false, validation.Message);
                }

                staged.Add(validation.Booking!);
                db.Bookings.Add(validation.Booking!);
                firstCreated ??= validation.Booking;
            }

            var shouldNotifyNewBooking = firstCreated is not null
                && (source == BookingSource.WalkIn
                    || (source == BookingSource.Online && salon.Settings?.NotifyOwnerOnNewBooking != false));

            if (shouldNotifyNewBooking)
            {
                var firstRequest = requests[0];
                var notificationTitle = source == BookingSource.WalkIn
                    ? "Walk-in booking created"
                    : (staged.Count > 1 ? "New group booking" : "New online booking");

                var notificationMessage = source == BookingSource.WalkIn
                    ? $"{firstCreated!.CustomerName} booked {firstRequest.Service} with {firstCreated.Barber.FullName} for {firstCreated.StartTime.ToString("h:mm tt", CultureInfo.InvariantCulture)}."
                    : (staged.Count > 1
                        ? $"{firstCreated!.CustomerName} booked {staged.Count} appointments for {firstCreated.AppointmentDate:yyyy-MM-dd}."
                        : $"{firstCreated!.CustomerName} booked {firstRequest.Service} with {firstCreated.Barber.FullName} for {firstCreated.AppointmentDate:yyyy-MM-dd} at {firstCreated.StartTime.ToString("h:mm tt", CultureInfo.InvariantCulture)}.");

                db.Notifications.Add(new SalonNotification
                {
                    SalonId = salon.Id,
                    Type = "booking",
                    Title = notificationTitle,
                    Message = notificationMessage,
                    Icon = source == BookingSource.WalkIn ? "bi-person-walking" : "bi-calendar2-plus",
                    Url = $"/admin/bookings?booking={firstCreated!.PublicId}",
                    IsRead = false
                });
            }

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            foreach (var createdBooking in staged.Where(x => x.Status == BookingStatus.Confirmed))
            {
                await whatsAppMessaging.TrySendBookingConfirmationAsync(
                    createdBooking.Id,
                    cancellationToken);
            }

            return new BookingMutationResponse(
                true,
                staged.Count > 1
                    ? $"{staged.Count} appointments booked successfully."
                    : "Booking created successfully.",
                firstCreated is null ? null : Map(firstCreated)
            );
        });
    }

    public async Task<BookingMutationResponse> UpdateStatusAsync(
        int id,
        string statusValue,
        CancellationToken cancellationToken)
    {
        var booking = await GetTrackedAsync(id, cancellationToken);
        if (booking is null) return new(false, "Booking not found.");

        if (!Enum.TryParse<BookingStatus>(statusValue, true, out var status))
            return new(false, "Invalid booking status.");

        if (booking.Status == BookingStatus.Cancelled && status != BookingStatus.Cancelled)
            return new(false, "Cancelled bookings cannot be reopened.");

        if (booking.Status == BookingStatus.Completed && status != BookingStatus.Completed)
            return new(false, "Completed bookings cannot be moved back to another status.");

        if ((status is BookingStatus.Confirmed or BookingStatus.Completed)
            && booking.ServiceLocation == ServiceLocation.Home
            && !string.IsNullOrWhiteSpace(booking.SpecialService)
            && !(booking.SpecialServiceAmount > 0))
        {
            return new(false, "Set the custom home-service price before confirming this booking.");
        }

        var previousStatus = booking.Status;
        booking.Status = status;
        await db.SaveChangesAsync(cancellationToken);

        if (previousStatus != BookingStatus.Confirmed && status == BookingStatus.Confirmed)
        {
            await whatsAppMessaging.TrySendBookingConfirmationAsync(
                booking.Id,
                cancellationToken);
        }

        return new(true, $"Booking {booking.BookingCode} marked {status.ToString().ToLowerInvariant()}.", Map(booking));
    }

    public async Task<BookingMutationResponse> AssignBarberAsync(
        int id,
        string barberName,
        CancellationToken cancellationToken)
    {
        var booking = await GetTrackedAsync(id, cancellationToken);
        if (booking is null) return new(false, "Booking not found.");
        if (booking.Status is BookingStatus.Cancelled or BookingStatus.Completed)
            return new(false, "This booking can no longer be reassigned.");

        var barber = await ResolveBarberAsync(booking.SalonId, barberName, cancellationToken);
        if (barber is null) return new(false, "Selected barber is not active.");

        var serviceIds = booking.Services.Where(x => x.ServiceId.HasValue).Select(x => x.ServiceId!.Value).ToList();
        if (serviceIds.Count > 0)
        {
            var supported = await db.BarberServices
                .CountAsync(x => x.BarberId == barber.Id && serviceIds.Contains(x.ServiceId), cancellationToken);

            if (supported != serviceIds.Distinct().Count())
                return new(false, $"{barber.FullName} does not provide all services in this booking.");
        }

        var availability = await ValidateBarberWindowAsync(
            booking.SalonId, barber, booking.AppointmentDate, booking.StartTime,
            booking.TotalDurationMinutes, booking.Id, cancellationToken);

        if (!availability.Success) return new(false, availability.Message);

        booking.BarberId = barber.Id;
        booking.Barber = barber;
        await db.SaveChangesAsync(cancellationToken);
        return new(true, $"{barber.FullName} assigned successfully.", Map(booking));
    }

    public async Task<BookingMutationResponse> RescheduleAsync(
        int id,
        ScheduleUpdateRequest request,
        CancellationToken cancellationToken)
    {
        var booking = await GetTrackedAsync(id, cancellationToken);
        if (booking is null) return new(false, "Booking not found.");
        if (booking.Status is BookingStatus.Cancelled or BookingStatus.Completed)
            return new(false, "This booking can no longer be rescheduled.");

        if (!DateOnly.TryParse(request.Date, out var date) || !TryParseTime(request.Time, out var time))
            return new(false, "Please choose a valid date and time.");

        var salon = await db.Salons.Include(x => x.Settings)
            .FirstAsync(x => x.Id == booking.SalonId, cancellationToken);

        var schedule = await ValidateSalonScheduleAsync(salon, date, time, booking.TotalDurationMinutes, false, cancellationToken);
        if (!schedule.Success) return new(false, schedule.Message);

        var barber = await db.Barbers.FirstAsync(x => x.Id == booking.BarberId, cancellationToken);
        var availability = await ValidateBarberWindowAsync(
            booking.SalonId, barber, date, time, booking.TotalDurationMinutes, booking.Id, cancellationToken);

        if (!availability.Success) return new(false, availability.Message);

        booking.AppointmentDate = date;
        booking.StartTime = time;
        await db.SaveChangesAsync(cancellationToken);
        return new(true, "Appointment rescheduled successfully.", Map(booking));
    }

    public async Task<BookingMutationResponse> UpdateSpecialServiceAmountAsync(
        int id,
        decimal amount,
        CancellationToken cancellationToken)
    {
        var booking = await GetTrackedAsync(id, cancellationToken);
        if (booking is null) return new(false, "Booking not found.");
        if (booking.Status is BookingStatus.Cancelled or BookingStatus.Completed)
            return new(false, "Closed bookings cannot be repriced.");
        if (booking.ServiceLocation != ServiceLocation.Home || string.IsNullOrWhiteSpace(booking.SpecialService))
            return new(false, "This booking does not contain a custom home-service request.");
        if (amount <= 0 || decimal.Truncate(amount) != amount)
            return new(false, "Enter a whole-rupee custom service amount greater than 0.");

        var previous = booking.SpecialServiceAmount ?? 0;
        booking.SpecialServiceAmount = amount;
        booking.TotalAmount = Math.Max(0, booking.TotalAmount - previous) + amount;
        var customLine = booking.Services.FirstOrDefault(x => x.ServiceId == null
            && x.ServiceName == "Custom Home Service");
        if (customLine is null)
        {
            customLine = new BookingService
            {
                ServiceName = "Custom Home Service",
                DurationMinutes = CustomHomeServiceDurationMinutes,
                SortOrder = booking.Services.Count
            };
            booking.Services.Add(customLine);
        }
        customLine.Amount = amount;

        await db.SaveChangesAsync(cancellationToken);
        return new(true, "Custom home-service price updated.", Map(booking));
    }

    public async Task<AvailabilityResponse> CheckAvailabilityAsync(
        AvailabilityRequest request,
        CancellationToken cancellationToken)
    {
        var salon = await db.Salons.Include(x => x.Settings)
            .FirstOrDefaultAsync(x => x.Slug == DefaultSalonSlug && x.IsActive, cancellationToken);

        if (salon is null)
            return new(false, "Salon configuration was not found.", []);

        if (!DateOnly.TryParse(request.Date, out var date) || !TryParseTime(request.Time, out var time))
            return new(false, "Select a valid appointment date and time.", []);

        var serviceLocation = Enum.TryParse<ServiceLocation>(request.ServiceLocation, true, out var parsedLocation)
            ? parsedLocation
            : ServiceLocation.Salon;

        var serviceNames = request.ServiceNames is { Count: > 0 }
            ? request.ServiceNames.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
            : SplitServices(request.Service);
        if (serviceNames.Count == 0)
            return new(false, "Select at least one service.", []);

        var customHomeService = serviceLocation == ServiceLocation.Home
            && serviceNames.Count == 1
            && string.Equals(serviceNames[0], "Custom Home Service", StringComparison.OrdinalIgnoreCase);

        List<Service> services = customHomeService
            ? []
            : await db.Services
                .Where(x => x.SalonId == salon.Id
                            && x.IsActive
                            && x.ServiceCategory.IsActive
                            && serviceNames.Contains(x.Name))
                .ToListAsync(cancellationToken);

        if (!customHomeService && services.Count != serviceNames.Count)
            return new(false, "One or more selected services are not available.", []);

        if (serviceLocation == ServiceLocation.Home && services.Any(x => !x.HomeServiceEnabled))
            return new(false, "One or more selected services are not available for home service.", []);

        var effectiveDuration = services.Sum(x => x.DurationMinutes)
            + (serviceLocation == ServiceLocation.Home && (customHomeService || !string.IsNullOrWhiteSpace(request.SpecialService))
                ? CustomHomeServiceDurationMinutes : 0);

        if (!IsValidAppointmentDuration(effectiveDuration))
            return new(false, "Booking duration is invalid.", []);

        var schedule = await ValidateSalonScheduleAsync(salon, date, time, effectiveDuration, false, cancellationToken);
        if (!schedule.Success)
            return new(false, schedule.Message, []);

        var serviceIds = services.Select(x => x.Id).ToList();

        var candidates = await db.Barbers
            .Where(x => x.SalonId == salon.Id && x.IsActive
                && (string.IsNullOrWhiteSpace(request.Barber) || x.FullName == request.Barber))
            .OrderByDescending(x => x.Rating)
            .ToListAsync(cancellationToken);

        var eligible = new List<string>();

        foreach (var barber in candidates)
        {
            if (serviceIds.Count > 0)
            {
                var supported = await db.BarberServices.CountAsync(
                    x => x.BarberId == barber.Id && serviceIds.Contains(x.ServiceId), cancellationToken);
                if (supported != serviceIds.Distinct().Count()) continue;
            }

            Guid? ignoreId = null;
            if (request.IgnoreBookingId.HasValue)
            {
                ignoreId = await db.Bookings
                    .Where(x => x.SalonId == salon.Id && x.PublicId == request.IgnoreBookingId)
                    .Select(x => (Guid?)x.Id)
                    .FirstOrDefaultAsync(cancellationToken);
            }

            var result = await ValidateBarberWindowAsync(
                salon.Id, barber, date, time, effectiveDuration, ignoreId, cancellationToken);

            if (result.Success) eligible.Add(barber.FullName);
        }

        return eligible.Count > 0
            ? new(true, "Available.", eligible)
            : new(false, "No eligible barber is available for this appointment window.", []);
    }

    private async Task<(bool Success, string Message, Booking? Booking)> ValidateAndBuildAsync(
        Salon salon,
        BookingRequest request,
        BookingSource source,
        int publicId,
        IReadOnlyList<Booking> staged,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.CustomerName))
            return (false, "Customer name is required.", null);

        if (!DateOnly.TryParse(request.Date, out var date) || !TryParseTime(request.Time, out var time))
            return (false, "Select a valid appointment date and time.", null);

        var serviceLocation = Enum.TryParse<ServiceLocation>(request.ServiceLocation, true, out var location)
            ? location
            : ServiceLocation.Salon;

        if (serviceLocation == ServiceLocation.Home && string.IsNullOrWhiteSpace(request.ServiceAddress))
            return (false, "Complete home-service address is required.", null);

        if (serviceLocation != ServiceLocation.Home && !string.IsNullOrWhiteSpace(request.SpecialService))
            return (false, "Custom service requests are only available for home bookings.", null);

        var hasCustomHomeService = serviceLocation == ServiceLocation.Home
            && !string.IsNullOrWhiteSpace(request.SpecialService);
        var serviceNames = request.ServiceNames is { Count: > 0 }
            ? request.ServiceNames.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
            : SplitServices(request.Service);

        if (serviceNames.Count == 0)
            return (false, "Select at least one service.", null);

        var customHomeService = hasCustomHomeService
            && serviceNames.Count == 1
            && string.Equals(serviceNames[0], "Custom Home Service", StringComparison.OrdinalIgnoreCase);

        List<Service> services = customHomeService
            ? []
            : await db.Services
                .Where(x => x.SalonId == salon.Id
                            && x.IsActive
                            && x.ServiceCategory.IsActive
                            && serviceNames.Contains(x.Name))
                .ToListAsync(cancellationToken);

        if (!customHomeService && services.Count != serviceNames.Count)
            return (false, "One or more selected services are not available.", null);

        if (serviceLocation == ServiceLocation.Home && services.Any(x => !x.HomeServiceEnabled))
            return (false, "One or more selected services are not available for home service.", null);

        var effectiveDuration = services.Sum(x => x.DurationMinutes)
            + (hasCustomHomeService ? CustomHomeServiceDurationMinutes : 0);
        var effectiveAmount = services.Sum(x => GetServicePrice(x, serviceLocation));

        if (!IsValidAppointmentDuration(effectiveDuration) || effectiveAmount < 0)
            return (false, "Booking duration or amount is invalid.", null);

        var isWalkIn = source == BookingSource.WalkIn;
        var schedule = await ValidateSalonScheduleAsync(salon, date, time, effectiveDuration, isWalkIn, cancellationToken);
        if (!schedule.Success) return (false, schedule.Message, null);

        var barber = await ResolveBarberAsync(salon.Id, request.Barber, cancellationToken);
        if (barber is null)
            return (false, "Selected barber is not active.", null);

        if (services.Count > 0)
        {
            var supported = await db.BarberServices
                .CountAsync(x => x.BarberId == barber.Id && services.Select(s => s.Id).Contains(x.ServiceId), cancellationToken);
            if (supported != services.Count)
                return (false, $"{barber.FullName} does not provide all selected services.", null);
        }

        var barberWindow = await ValidateBarberWindowAsync(
            salon.Id, barber, date, time, effectiveDuration, null, cancellationToken);
        if (!barberWindow.Success) return (false, barberWindow.Message, null);

        if (staged.Any(x => x.BarberId == barber.Id
                            && x.AppointmentDate == date
                            && Overlaps(x.StartTime, x.TotalDurationMinutes, time, effectiveDuration)))
        {
            return (false, $"{barber.FullName} already has an overlapping appointment at this time.", null);
        }

        Customer? customer = null;
        var normalizedPhone = NormalizePhone(request.Phone);

        if (!string.IsNullOrWhiteSpace(normalizedPhone))
        {
            customer = db.Customers.Local.FirstOrDefault(
                x => x.SalonId == salon.Id && x.Phone == normalizedPhone)
                ?? await db.Customers.FirstOrDefaultAsync(
                    x => x.SalonId == salon.Id && x.Phone == normalizedPhone, cancellationToken);

            if (customer is null)
            {
                customer = new Customer
                {
                    SalonId = salon.Id,
                    FullName = request.CustomerName.Trim(),
                    Phone = normalizedPhone
                };
                db.Customers.Add(customer);
            }

            // Existing customer profiles are intentionally not overwritten by booking
            // form values. Each booking keeps its own customer-name snapshot, while
            // profile changes are explicit admin actions in the Customers section.
        }
        else
        {
            // Phone-less walk-ins must remain separate customers. Creating a dedicated
            // row keeps notes/history in SQL without accidentally merging unrelated guests.
            customer = new Customer
            {
                SalonId = salon.Id,
                FullName = request.CustomerName.Trim(),
                Phone = null
            };
            db.Customers.Add(customer);
        }

        var status = source == BookingSource.WalkIn
            ? BookingStatus.Confirmed
            : (hasCustomHomeService
                ? BookingStatus.Pending
                : (salon.Settings?.AutoConfirmBookings == false ? BookingStatus.Pending : BookingStatus.Confirmed));

        var trustedSpecialServiceAmount = source == BookingSource.Admin && hasCustomHomeService
            ? request.SpecialServiceAmount
            : null;

        if (trustedSpecialServiceAmount is { } customAmount
            && (customAmount <= 0 || decimal.Truncate(customAmount) != customAmount))
            return (false, "Enter a whole-rupee custom service amount greater than 0.", null);

        var booking = new Booking
        {
            SalonId = salon.Id,
            Customer = customer,
            CustomerId = customer?.Id,
            BarberId = barber.Id,
            Barber = barber,
            PublicId = publicId,
            BookingCode = BuildBookingCode(publicId),
            CustomerName = request.CustomerName.Trim(),
            CustomerPhone = normalizedPhone,
            AppointmentDate = date,
            StartTime = time,
            TotalDurationMinutes = effectiveDuration,
            TotalAmount = effectiveAmount + (trustedSpecialServiceAmount ?? 0),
            Status = status,
            Source = source,
            ServiceLocation = serviceLocation,
            GroupSize = Math.Max(1, request.GroupSize),
            Notes = request.Notes?.Trim(),
            ServiceAddress = serviceLocation == ServiceLocation.Home ? request.ServiceAddress?.Trim() : null,
            SpecialService = hasCustomHomeService ? request.SpecialService?.Trim() : null,
            SpecialServiceAmount = trustedSpecialServiceAmount
        };

        if (services.Count > 0)
        {
            var byName = services.ToDictionary(x => x.Name, StringComparer.OrdinalIgnoreCase);
            for (var index = 0; index < serviceNames.Count; index++)
            {
                var name = serviceNames[index];
                var service = byName[name];
                booking.Services.Add(new BookingService
                {
                    ServiceId = service.Id,
                    Service = service,
                    ServiceName = service.Name,
                    DurationMinutes = service.DurationMinutes,
                    Amount = GetServicePrice(service, serviceLocation),
                    SortOrder = index
                });
            }
        }
        if (hasCustomHomeService)
        {
            booking.Services.Add(new BookingService
            {
                ServiceName = "Custom Home Service",
                DurationMinutes = CustomHomeServiceDurationMinutes,
                Amount = trustedSpecialServiceAmount ?? 0,
                SortOrder = booking.Services.Count
            });
        }

        return (true, string.Empty, booking);
    }

    private async Task<(bool Success, string Message)> ValidateSalonScheduleAsync(
        Salon salon,
        DateOnly date,
        TimeOnly time,
        int duration,
        bool allowWalkInCurrentMinute,
        CancellationToken cancellationToken)
    {
        if (!IsValidAppointmentDuration(duration))
            return (false, "Booking duration is invalid.");

        var salonNow = GetSalonNow(salon);
        var today = DateOnly.FromDateTime(salonNow.DateTime);
        if (date < today)
            return (false, "The selected appointment date has already passed.");

        if (date == today && salon.Settings?.AllowSameDayBooking == false && !allowWalkInCurrentMinute)
            return (false, "Same-day online booking is disabled.");

        var maxAdvance = Math.Max(1, salon.Settings?.MaxAdvanceDays ?? 30);
        if (date > today.AddDays(maxAdvance))
            return (false, "This date is outside the current booking window.");

        var hours = await db.BusinessHours
            .FirstOrDefaultAsync(x => x.SalonId == salon.Id && x.DayOfWeek == date.DayOfWeek, cancellationToken);

        if (hours is null || !hours.IsOpen || !hours.OpenTime.HasValue || !hours.CloseTime.HasValue)
            return (false, "The salon is closed on the selected date.");

        var start = time.ToTimeSpan();
        var end = start + TimeSpan.FromMinutes(duration);
        if (start < hours.OpenTime.Value.ToTimeSpan() || end > hours.CloseTime.Value.ToTimeSpan())
            return (false, "This appointment falls outside the configured business hours.");

        if (date == today)
        {
            var now = TimeOnly.FromDateTime(salonNow.DateTime);

            // Walk-ins are selected and transmitted with minute precision (for example 4:52 PM).
            // Compare them against the salon's current minute, not current seconds, otherwise
            // 4:52 PM would be rejected at 4:52:15 PM as already passed.
            var currentMinute = new TimeOnly(now.Hour, now.Minute);
            var isPast = allowWalkInCurrentMinute
                ? time < currentMinute
                : time <= now;

            if (isPast)
                return (false, "The selected appointment time has already passed.");
        }

        return (true, string.Empty);
    }

    private async Task<(bool Success, string Message)> ValidateBarberWindowAsync(
        Guid salonId,
        Barber barber,
        DateOnly date,
        TimeOnly time,
        int duration,
        Guid? ignoreBookingId,
        CancellationToken cancellationToken)
    {
        if (!IsValidAppointmentDuration(duration))
            return (false, "Booking duration is invalid.");

        var onLeave = await db.BarberLeaves.AnyAsync(
            x => x.BarberId == barber.Id && x.StartDate <= date && x.EndDate >= date,
            cancellationToken);

        if (onLeave)
            return (false, $"{barber.FullName} is on leave on this date.");

        var dayOverride = await db.BarberScheduleOverrides
            .FirstOrDefaultAsync(x => x.BarberId == barber.Id && x.Date == date, cancellationToken);

        if (dayOverride is { IsAvailable: false })
            return (false, $"{barber.FullName} is not available on this date.");

        var working = await db.BarberWorkingHours
            .FirstOrDefaultAsync(x => x.BarberId == barber.Id && x.DayOfWeek == date.DayOfWeek, cancellationToken);

        // No barber-specific row means this barber follows the salon business hours.
        // ValidateSalonScheduleAsync has already checked that window before this method runs.
        if (working is not null)
        {
            if (!working.IsWorking || !working.StartTime.HasValue || !working.EndTime.HasValue)
                return (false, $"{barber.FullName} is not working on this date.");

            var start = time.ToTimeSpan();
            var end = start + TimeSpan.FromMinutes(duration);
            if (start < working.StartTime.Value.ToTimeSpan() || end > working.EndTime.Value.ToTimeSpan())
                return (false, $"{barber.FullName} is outside their configured working hours at this time.");
        }

        var dayBookings = await db.Bookings
            .Where(x => x.SalonId == salonId
                && x.BarberId == barber.Id
                && x.AppointmentDate == date
                && x.Status != BookingStatus.Cancelled
                && (!ignoreBookingId.HasValue || x.Id != ignoreBookingId.Value))
            .Select(x => new { x.StartTime, x.TotalDurationMinutes })
            .ToListAsync(cancellationToken);

        if (dayBookings.Any(x => Overlaps(x.StartTime, x.TotalDurationMinutes, time, duration)))
            return (false, $"{barber.FullName} already has an overlapping appointment at this time.");

        return (true, string.Empty);
    }

    private async Task<Booking?> GetTrackedAsync(int publicId, CancellationToken cancellationToken)
    {
        var salonId = await GetSalonIdAsync(cancellationToken);

        return await db.Bookings
            .Include(x => x.Barber)
            .Include(x => x.Services)
            .FirstOrDefaultAsync(x => x.SalonId == salonId && x.PublicId == publicId, cancellationToken);
    }

    private async Task<Barber?> ResolveBarberAsync(Guid salonId, string name, CancellationToken cancellationToken)
        => await db.Barbers.FirstOrDefaultAsync(
            x => x.SalonId == salonId && x.IsActive && x.FullName == name, cancellationToken);

    private async Task<Guid> GetSalonIdAsync(CancellationToken cancellationToken)
        => await db.Salons
            .Where(x => x.Slug == DefaultSalonSlug && x.IsActive)
            .Select(x => x.Id)
            .FirstAsync(cancellationToken);

    private static bool Overlaps(TimeOnly firstStart, int firstDuration, TimeOnly secondStart, int secondDuration)
    {
        var firstStartValue = firstStart.ToTimeSpan();
        var secondStartValue = secondStart.ToTimeSpan();
        var firstEnd = firstStartValue + TimeSpan.FromMinutes(firstDuration);
        var secondEnd = secondStartValue + TimeSpan.FromMinutes(secondDuration);

        return firstStartValue < secondEnd && secondStartValue < firstEnd;
    }

    private static bool IsValidAppointmentDuration(int duration)
        => duration > 0 && duration < 24 * 60;

    private static decimal GetServicePrice(Service service, ServiceLocation location)
    {
        if (location == ServiceLocation.Home && service.HomeServiceEnabled)
        {
            return service.HomeDiscountPrice is > 0
                ? service.HomeDiscountPrice.Value
                : service.HomeOriginalPrice ?? service.OriginalPrice;
        }

        return service.DiscountPrice is > 0
            ? service.DiscountPrice.Value
            : service.OriginalPrice;
    }

    private static List<string> SplitServices(string value)
        => value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).ToList();

    private static bool TryParseTime(string value, out TimeOnly time)
        => TimeOnly.TryParseExact(
            value,
            ["h:mm tt", "hh:mm tt"],
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out time);

    private static DateTimeOffset GetSalonNow(Salon salon)
    {
        try
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(salon.TimeZone);
            return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone);
        }
        catch (TimeZoneNotFoundException)
        {
            return DateTimeOffset.UtcNow;
        }
        catch (InvalidTimeZoneException)
        {
            return DateTimeOffset.UtcNow;
        }
    }

    private static string NormalizePhone(string? value)
    {
        var digits = new string((value ?? string.Empty).Where(char.IsDigit).ToArray());
        if (digits.StartsWith("92") && digits.Length == 12) return "+" + digits;
        if (digits.StartsWith("3") && digits.Length == 10) return "+92" + digits;
        return string.IsNullOrWhiteSpace(digits) ? string.Empty : "+" + digits;
    }

    private static string BuildBookingCode(int publicId) => $"RB-{2600 + publicId}";

    private static BookingResponse Map(Booking booking)
    {
        var services = booking.Services.OrderBy(x => x.SortOrder).ToList();
        var namedServices = services.Where(x => x.ServiceId != null || x.ServiceName != "Custom Home Service").Select(x => x.ServiceName).ToList();
        if (namedServices.Count == 0) namedServices = services.Select(x => x.ServiceName).ToList();
        return new BookingResponse(
            booking.PublicId,
            booking.BookingCode,
            booking.CustomerName,
            booking.CustomerPhone ?? string.Empty,
            string.Join(", ", namedServices),
            booking.TotalDurationMinutes,
            booking.Barber.FullName,
            booking.AppointmentDate.ToString("yyyy-MM-dd"),
            booking.StartTime.ToString("h:mm tt"),
            booking.TotalAmount,
            booking.Status.ToString(),
            booking.Source == BookingSource.WalkIn ? "Walk-in" : booking.Source.ToString(),
            booking.Notes ?? string.Empty,
            booking.GroupSize,
            booking.ServiceLocation.ToString(),
            booking.ServiceAddress ?? string.Empty,
            booking.SpecialService ?? string.Empty,
            booking.SpecialServiceAmount ?? 0,
            namedServices
        );
    }
}
