using BarberFlow.Api.Contracts.Bookings;
using BarberFlow.Api.Contracts.Customers;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Services;

public sealed class CustomerApplicationService(BarberFlowDbContext db)
{
    public async Task<IReadOnlyList<CustomerResponse>> GetAllAsync(
        Guid salonId,
        CancellationToken cancellationToken)
    {
        var salon = await db.Salons
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == salonId, cancellationToken);

        if (salon is null)
            return [];

        var customers = await db.Customers
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .Include(x => x.Bookings)
                .ThenInclude(x => x.Barber)
            .Include(x => x.Bookings)
                .ThenInclude(x => x.Services)
            .ToListAsync(cancellationToken);

        var now = GetSalonNow(salon);
        var today = DateOnly.FromDateTime(now.DateTime);
        var time = TimeOnly.FromDateTime(now.DateTime);

        var result = customers
            .Select(customer => MapCustomer(customer, today, time))
            .ToList();

        // Preserve access to phone-less bookings created before customer SQL persistence
        // was introduced. Saving a note on one of these records upgrades it to a real customer.
        var legacyWalkIns = await db.Bookings
            .AsNoTracking()
            .Where(x => x.SalonId == salonId
                        && x.CustomerId == null
                        && (x.CustomerPhone == null || x.CustomerPhone == ""))
            .Include(x => x.Barber)
            .Include(x => x.Services)
            .ToListAsync(cancellationToken);

        result.AddRange(legacyWalkIns.Select(booking => MapLegacyWalkIn(booking, today, time)));

        return result
            .OrderByDescending(x => x.LastBookingDate)
            .ThenBy(x => x.Name)
            .ToList();
    }

    public async Task<CustomerResponse?> GetByIdAsync(
        Guid salonId,
        string id,
        CancellationToken cancellationToken)
    {
        var salon = await db.Salons
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == salonId, cancellationToken);

        if (salon is null)
            return null;

        var now = GetSalonNow(salon);
        var today = DateOnly.FromDateTime(now.DateTime);
        var time = TimeOnly.FromDateTime(now.DateTime);

        if (Guid.TryParse(id, out var customerId))
        {
            var customer = await db.Customers
                .AsNoTracking()
                .Where(x => x.SalonId == salonId && x.Id == customerId)
                .Include(x => x.Bookings)
                    .ThenInclude(x => x.Barber)
                .Include(x => x.Bookings)
                    .ThenInclude(x => x.Services)
                .FirstOrDefaultAsync(cancellationToken);

            return customer is null ? null : MapCustomer(customer, today, time);
        }

        if (!TryParseLegacyWalkInId(id, out var publicId))
            return null;

        var booking = await db.Bookings
            .AsNoTracking()
            .Where(x => x.SalonId == salonId
                        && x.PublicId == publicId
                        && x.CustomerId == null
                        && (x.CustomerPhone == null || x.CustomerPhone == ""))
            .Include(x => x.Barber)
            .Include(x => x.Services)
            .FirstOrDefaultAsync(cancellationToken);

        return booking is null ? null : MapLegacyWalkIn(booking, today, time);
    }

    public async Task<CustomerMutationResponse> UpdateProfileAsync(
        Guid salonId,
        string id,
        CustomerProfileUpdateRequest request,
        CancellationToken cancellationToken)
    {
        var name = (request.Name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            return new(false, "Customer name is required.");

        if (name.Length > 160)
            return new(false, "Customer name cannot exceed 160 characters.");

        var phone = NormalizePhone(request.Phone);
        if (!string.IsNullOrWhiteSpace(phone) && !IsValidPakistanPhone(phone))
            return new(false, "Enter a valid Pakistan phone number.");

        var email = (request.Email ?? string.Empty).Trim();
        if (email.Length > 254)
            return new(false, "Customer email cannot exceed 254 characters.");

        if (!string.IsNullOrWhiteSpace(email) && !IsValidEmail(email))
            return new(false, "Enter a valid email address.");

        if (Guid.TryParse(id, out var customerId))
        {
            var customer = await db.Customers
                .FirstOrDefaultAsync(
                    x => x.SalonId == salonId && x.Id == customerId,
                    cancellationToken);

            if (customer is null)
                return new(false, "Customer not found.");

            if (!string.IsNullOrWhiteSpace(phone))
            {
                var duplicatePhone = await db.Customers
                    .AnyAsync(
                        x => x.SalonId == salonId
                             && x.Id != customer.Id
                             && x.Phone == phone,
                        cancellationToken);

                if (duplicatePhone)
                    return new(false, "Another customer already uses this phone number.");
            }

            customer.FullName = name;
            customer.Phone = string.IsNullOrWhiteSpace(phone) ? null : phone;
            customer.Email = string.IsNullOrWhiteSpace(email) ? null : email;
            customer.UpdatedAtUtc = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync(cancellationToken);

            var response = await GetByIdAsync(
                salonId,
                customer.Id.ToString(),
                cancellationToken);

            return new(true, "Customer profile updated.", response);
        }

        if (!TryParseLegacyWalkInId(id, out var publicId))
            return new(false, "Customer not found.");

        var legacyBooking = await db.Bookings
            .FirstOrDefaultAsync(
                x => x.SalonId == salonId
                     && x.PublicId == publicId
                     && x.CustomerId == null
                     && (x.CustomerPhone == null || x.CustomerPhone == ""),
                cancellationToken);

        if (legacyBooking is null)
            return new(false, "Customer not found.");

        if (!string.IsNullOrWhiteSpace(phone))
        {
            var duplicatePhone = await db.Customers
                .AnyAsync(
                    x => x.SalonId == salonId && x.Phone == phone,
                    cancellationToken);

            if (duplicatePhone)
                return new(false, "Another customer already uses this phone number.");
        }

        var createdCustomer = new Customer
        {
            SalonId = salonId,
            FullName = name,
            Phone = string.IsNullOrWhiteSpace(phone) ? null : phone,
            Email = string.IsNullOrWhiteSpace(email) ? null : email
        };

        db.Customers.Add(createdCustomer);
        legacyBooking.Customer = createdCustomer;
        legacyBooking.CustomerId = createdCustomer.Id;

        await db.SaveChangesAsync(cancellationToken);

        var upgraded = await GetByIdAsync(
            salonId,
            createdCustomer.Id.ToString(),
            cancellationToken);

        return new(true, "Customer profile updated.", upgraded);
    }

    public async Task<CustomerMutationResponse> UpdateNotesAsync(
        Guid salonId,
        string id,
        string? notes,
        CancellationToken cancellationToken)
    {
        var normalizedNotes = (notes ?? string.Empty).Trim();
        if (normalizedNotes.Length > 2000)
            return new(false, "Customer notes cannot exceed 2000 characters.");

        if (Guid.TryParse(id, out var customerId))
        {
            var customer = await db.Customers
                .FirstOrDefaultAsync(
                    x => x.SalonId == salonId && x.Id == customerId,
                    cancellationToken);

            if (customer is null)
                return new(false, "Customer not found.");

            customer.Notes = normalizedNotes;
            await db.SaveChangesAsync(cancellationToken);

            var response = await GetByIdAsync(salonId, customer.Id.ToString(), cancellationToken);
            return new(true, "Customer note saved.", response);
        }

        if (!TryParseLegacyWalkInId(id, out var publicId))
            return new(false, "Customer not found.");

        var legacyBooking = await db.Bookings
            .FirstOrDefaultAsync(
                x => x.SalonId == salonId
                     && x.PublicId == publicId
                     && x.CustomerId == null
                     && (x.CustomerPhone == null || x.CustomerPhone == ""),
                cancellationToken);

        if (legacyBooking is null)
            return new(false, "Customer not found.");

        var createdCustomer = new Customer
        {
            SalonId = salonId,
            FullName = legacyBooking.CustomerName,
            Phone = null,
            Notes = normalizedNotes
        };

        db.Customers.Add(createdCustomer);
        legacyBooking.Customer = createdCustomer;
        legacyBooking.CustomerId = createdCustomer.Id;
        await db.SaveChangesAsync(cancellationToken);

        var upgraded = await GetByIdAsync(salonId, createdCustomer.Id.ToString(), cancellationToken);
        return new(true, "Customer note saved.", upgraded);
    }

    private static CustomerResponse MapCustomer(
        Customer customer,
        DateOnly today,
        TimeOnly now)
    {
        var ordered = customer.Bookings
            .OrderBy(x => x.AppointmentDate)
            .ThenBy(x => x.StartTime)
            .ToList();

        var nonCancelled = ordered
            .Where(x => x.Status != BookingStatus.Cancelled)
            .ToList();

        var completed = ordered
            .Where(x => x.Status == BookingStatus.Completed)
            .ToList();

        var next = ordered
            .Where(x => x.Status is BookingStatus.Pending or BookingStatus.Confirmed)
            .Where(x => x.AppointmentDate > today
                        || (x.AppointmentDate == today && x.StartTime >= now))
            .OrderBy(x => x.AppointmentDate)
            .ThenBy(x => x.StartTime)
            .FirstOrDefault();

        var first = ordered.FirstOrDefault();
        var last = ordered.LastOrDefault();
        var lastCompleted = completed
            .OrderByDescending(x => x.AppointmentDate)
            .ThenByDescending(x => x.StartTime)
            .FirstOrDefault();

        return new CustomerResponse(
            customer.Id.ToString(),
            customer.FullName,
            customer.Phone ?? string.Empty,
            customer.Email ?? string.Empty,
            nonCancelled.Count,
            completed.Count,
            ordered.Count(x => x.Status == BookingStatus.Cancelled),
            completed.Sum(x => x.TotalAmount),
            lastCompleted?.AppointmentDate.ToString("yyyy-MM-dd"),
            next is null ? null : MapBooking(next),
            nonCancelled.Count > 1 ? "Returning" : "New",
            first?.AppointmentDate.ToString("yyyy-MM-dd") ?? string.Empty,
            last?.AppointmentDate.ToString("yyyy-MM-dd") ?? string.Empty,
            customer.Notes ?? string.Empty,
            ordered
                .OrderByDescending(x => x.AppointmentDate)
                .ThenByDescending(x => x.StartTime)
                .Select(MapBooking)
                .ToList()
        );
    }

    private static CustomerResponse MapLegacyWalkIn(
        Booking booking,
        DateOnly today,
        TimeOnly now)
    {
        var completed = booking.Status == BookingStatus.Completed;
        var cancelled = booking.Status == BookingStatus.Cancelled;
        var upcoming = booking.Status is BookingStatus.Pending or BookingStatus.Confirmed
                       && (booking.AppointmentDate > today
                           || (booking.AppointmentDate == today && booking.StartTime >= now));

        return new CustomerResponse(
            $"walkin-{booking.PublicId}",
            booking.CustomerName,
            string.Empty,
            string.Empty,
            cancelled ? 0 : 1,
            completed ? 1 : 0,
            cancelled ? 1 : 0,
            completed ? booking.TotalAmount : 0,
            completed ? booking.AppointmentDate.ToString("yyyy-MM-dd") : null,
            upcoming ? MapBooking(booking) : null,
            "New",
            booking.AppointmentDate.ToString("yyyy-MM-dd"),
            booking.AppointmentDate.ToString("yyyy-MM-dd"),
            string.Empty,
            [MapBooking(booking)]
        );
    }

    private static BookingResponse MapBooking(Booking booking)
    {
        var services = booking.Services
            .OrderBy(x => x.SortOrder)
            .ToList();

        return new BookingResponse(
            booking.PublicId,
            booking.BookingCode,
            booking.CustomerName,
            booking.CustomerPhone ?? string.Empty,
            string.Join(", ", services.Select(x => x.ServiceName)),
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
            booking.SpecialServiceAmount ?? 0
        );
    }

    private static string NormalizePhone(string? value)
    {
        var digits = new string((value ?? string.Empty).Where(char.IsDigit).ToArray());

        if (digits.StartsWith("92") && digits.Length == 12)
            return "+" + digits;

        if (digits.StartsWith("3") && digits.Length == 10)
            return "+92" + digits;

        return string.IsNullOrWhiteSpace(digits) ? string.Empty : "+" + digits;
    }

    private static bool IsValidPakistanPhone(string phone)
        => phone.Length == 13
           && phone.StartsWith("+923", StringComparison.Ordinal)
           && phone[1..].All(char.IsDigit);

    private static bool IsValidEmail(string email)
    {
        var at = email.IndexOf('@');
        var lastAt = email.LastIndexOf('@');

        return at > 0
               && at == lastAt
               && at < email.Length - 1
               && email[(at + 1)..].Contains('.');
    }

    private static bool TryParseLegacyWalkInId(string id, out int publicId)
    {
        publicId = 0;
        return id.StartsWith("walkin-", StringComparison.OrdinalIgnoreCase)
               && int.TryParse(id["walkin-".Length..], out publicId);
    }

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
}
