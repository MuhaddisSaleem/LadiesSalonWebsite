using System.Globalization;
using BarberFlow.Api.Contracts.Dashboard;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Services;

public sealed class DashboardApplicationService(BarberFlowDbContext db)
{
    public async Task<DashboardResponse?> GetAsync(
        Guid salonId,
        CancellationToken cancellationToken)
    {
        var salon = await db.Salons
            .AsNoTracking()
            .Include(x => x.BusinessHours)
            .FirstOrDefaultAsync(x => x.Id == salonId && x.IsActive, cancellationToken);

        if (salon is null)
            return null;

        var salonNow = GetSalonNow(salon);
        var today = DateOnly.FromDateTime(salonNow.DateTime);
        var yesterday = today.AddDays(-1);
        var thirtyDayStart = today.AddDays(-29);
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var nowTime = TimeOnly.FromDateTime(salonNow.DateTime);

        var bookings = await db.Bookings
            .AsNoTracking()
            .Where(x => x.SalonId == salonId && x.AppointmentDate >= thirtyDayStart && x.AppointmentDate <= today)
            .Include(x => x.Barber)
            .Include(x => x.Services)
            .ToListAsync(cancellationToken);

        var todayBookings = bookings
            .Where(x => x.AppointmentDate == today)
            .OrderBy(x => x.StartTime)
            .ToList();

        var yesterdayBookings = bookings
            .Where(x => x.AppointmentDate == yesterday)
            .ToList();

        var customers = await db.Customers
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .Include(x => x.Bookings)
            .ToListAsync(cancellationToken);

        var activeBarbers = await db.Barbers
            .AsNoTracking()
            .Where(x => x.SalonId == salonId && x.IsActive)
            .Include(x => x.WorkingHours)
            .Include(x => x.ScheduleOverrides)
            .Include(x => x.Leaves)
            .OrderBy(x => x.FullName)
            .ToListAsync(cancellationToken);

        var nonCancelledToday = todayBookings
            .Where(x => x.Status != BookingStatus.Cancelled)
            .ToList();

        var completedToday = todayBookings
            .Where(x => x.Status == BookingStatus.Completed)
            .ToList();

        var completedYesterday = yesterdayBookings
            .Where(x => x.Status == BookingStatus.Completed)
            .ToList();

        var bookedToday = nonCancelledToday.Sum(x => x.TotalAmount);
        var completedRevenueToday = completedToday.Sum(x => x.TotalAmount);
        var openToday = todayBookings
            .Where(x => x.Status is BookingStatus.Pending or BookingStatus.Confirmed)
            .Sum(x => x.TotalAmount);

        var appointments = todayBookings.Select(x => new DashboardAppointmentResponse(
            x.PublicId,
            x.StartTime.ToString("h:mm tt", CultureInfo.InvariantCulture),
            x.CustomerName,
            x.CustomerPhone ?? string.Empty,
            string.Join(", ", x.Services.OrderBy(s => s.SortOrder).Select(s => s.ServiceName)),
            x.Barber.FullName,
            x.TotalAmount,
            x.Status.ToString()
        )).ToList();

        var barberLoad = BuildBarberLoad(
            salon,
            activeBarbers,
            nonCancelledToday,
            today);

        var topServices = BuildTopServices(bookings);

        var recentCustomers = customers
            .Where(x => x.Bookings.Count != 0)
            .OrderByDescending(x => x.Bookings.Max(b => b.AppointmentDate.ToDateTime(b.StartTime)))
            .ThenBy(x => x.FullName)
            .Take(4)
            .Select(x => new DashboardRecentCustomerResponse(
                x.Id.ToString(),
                x.FullName,
                x.Phone ?? string.Empty,
                x.Bookings.Count(b => b.Status == BookingStatus.Completed),
                x.Bookings
                    .Where(b => b.Status == BookingStatus.Completed)
                    .Sum(b => b.TotalAmount)
            ))
            .ToList();

        var returningCustomers = customers.Count(x =>
            x.Bookings.Count(b => b.Status != BookingStatus.Cancelled) > 1);

        var newCustomersThisMonth = customers.Count(x =>
            x.Bookings.Count != 0
            && x.Bookings.Min(b => b.AppointmentDate) >= monthStart
            && x.Bookings.Min(b => b.AppointmentDate) <= today);

        return new DashboardResponse(
            salon.Name,
            today.ToString("yyyy-MM-dd"),
            new DashboardSummaryResponse(
                nonCancelledToday.Count,
                yesterdayBookings.Count(x => x.Status != BookingStatus.Cancelled),
                todayBookings.Count(x =>
                    (x.Status is BookingStatus.Pending or BookingStatus.Confirmed)
                    && x.StartTime >= nowTime),
                customers.Count,
                newCustomersThisMonth,
                returningCustomers,
                activeBarbers.Count,
                barberLoad.Count(x => x.Available)
            ),
            new DashboardRevenueResponse(
                completedRevenueToday,
                completedYesterday.Sum(x => x.TotalAmount),
                bookedToday,
                openToday,
                nonCancelledToday.Count == 0
                    ? 0
                    : Math.Round(bookedToday / nonCancelledToday.Count, 2)
            ),
            appointments,
            barberLoad,
            topServices,
            recentCustomers
        );
    }

    private static IReadOnlyList<DashboardBarberLoadResponse> BuildBarberLoad(
        Salon salon,
        IReadOnlyList<Barber> barbers,
        IReadOnlyList<Booking> todayBookings,
        DateOnly today)
    {
        var salonHours = salon.BusinessHours
            .FirstOrDefault(x => x.DayOfWeek == today.DayOfWeek);

        return barbers.Select(barber =>
        {
            var onLeave = barber.Leaves.Any(x => x.StartDate <= today && x.EndDate >= today);
            var unavailableOverride = barber.ScheduleOverrides.Any(x => x.Date == today && !x.IsAvailable);
            var working = barber.WorkingHours.FirstOrDefault(x => x.DayOfWeek == today.DayOfWeek);

            var available = salonHours is { IsOpen: true, OpenTime: not null, CloseTime: not null }
                && !onLeave
                && !unavailableOverride
                && (working is null || (working.IsWorking && working.StartTime.HasValue && working.EndTime.HasValue));

            var appointments = todayBookings
                .Where(x => x.BarberId == barber.Id)
                .ToList();

            var percent = 0;

            if (available && salonHours?.OpenTime is not null && salonHours.CloseTime is not null)
            {
                var start = salonHours.OpenTime.Value;
                var end = salonHours.CloseTime.Value;

                if (working?.StartTime is not null && working.EndTime is not null)
                {
                    if (working.StartTime.Value > start) start = working.StartTime.Value;
                    if (working.EndTime.Value < end) end = working.EndTime.Value;
                }

                var capacity = MinutesBetween(start, end);
                var bookedMinutes = appointments.Sum(x => x.TotalDurationMinutes);

                percent = capacity <= 0
                    ? 0
                    : Math.Min(100, (int)Math.Round(bookedMinutes * 100m / capacity));
            }

            return new DashboardBarberLoadResponse(
                barber.PublicId,
                barber.FullName,
                percent,
                appointments.Count,
                available
            );
        }).ToList();
    }

    private static IReadOnlyList<DashboardTopServiceResponse> BuildTopServices(
        IReadOnlyList<Booking> bookings)
    {
        var groups = bookings
            .Where(x => x.Status != BookingStatus.Cancelled)
            .SelectMany(booking => booking.Services.Select(service => new
            {
                Booking = booking,
                Service = service
            }))
            .GroupBy(x => x.Service.ServiceName, StringComparer.OrdinalIgnoreCase)
            .Select(group => new
            {
                Name = group.First().Service.ServiceName,
                Bookings = group.Count(),
                Revenue = group
                    .Where(x => x.Booking.Status == BookingStatus.Completed)
                    .Sum(x => x.Service.Amount)
            })
            .OrderByDescending(x => x.Bookings)
            .ThenByDescending(x => x.Revenue)
            .Take(4)
            .ToList();

        var maxBookings = Math.Max(1, groups.Count == 0 ? 0 : groups.Max(x => x.Bookings));

        return groups.Select(x => new DashboardTopServiceResponse(
            x.Name,
            x.Bookings,
            (int)Math.Round(x.Bookings * 100m / maxBookings),
            x.Revenue
        )).ToList();
    }

    private static int MinutesBetween(TimeOnly start, TimeOnly end)
        => Math.Max(0, (end.Hour * 60 + end.Minute) - (start.Hour * 60 + start.Minute));

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
