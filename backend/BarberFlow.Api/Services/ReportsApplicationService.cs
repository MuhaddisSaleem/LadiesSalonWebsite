using System.Globalization;
using BarberFlow.Api.Contracts.Reports;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Services;

public sealed class ReportsApplicationService(BarberFlowDbContext db)
{
    public async Task<ReportsResponse> GetAsync(
        Guid salonId,
        DateOnly dateFrom,
        DateOnly dateTo,
        string? barberName,
        BookingStatus? status,
        CancellationToken cancellationToken)
    {
        var query = db.Bookings
            .AsNoTracking()
            .Where(x => x.SalonId == salonId
                        && x.AppointmentDate >= dateFrom
                        && x.AppointmentDate <= dateTo)
            .Include(x => x.Barber)
            .Include(x => x.Services)
            .AsQueryable();

        var rangeBookings = await query.ToListAsync(cancellationToken);

        var barberOptions = rangeBookings
            .Select(x => x.Barber.FullName)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x)
            .ToList();

        var filtered = rangeBookings
            .Where(x => string.IsNullOrWhiteSpace(barberName)
                        || x.Barber.FullName.Equals(barberName, StringComparison.OrdinalIgnoreCase))
            .Where(x => !status.HasValue || x.Status == status.Value)
            .OrderBy(x => x.AppointmentDate)
            .ThenBy(x => x.StartTime)
            .ToList();

        var totalBookings = filtered.Count;
        var completedBookings = filtered.Count(x => x.Status == BookingStatus.Completed);
        var cancelledBookings = filtered.Count(x => x.Status == BookingStatus.Cancelled);
        var bookedValue = filtered
            .Where(x => x.Status != BookingStatus.Cancelled)
            .Sum(x => x.TotalAmount);
        var completedRevenue = filtered
            .Where(x => x.Status == BookingStatus.Completed)
            .Sum(x => x.TotalAmount);
        var averageCompletedTicket = completedBookings == 0
            ? 0
            : Math.Round(completedRevenue / completedBookings, 2);
        var eligibleForCompletion = filtered.Count(x => x.Status != BookingStatus.Cancelled);
        var completionRate = eligibleForCompletion == 0
            ? 0
            : (int)Math.Round(completedBookings * 100m / eligibleForCompletion);

        var services = BuildServiceRows(filtered);
        var barbers = BuildBarberRows(filtered);
        var daily = BuildDailyRows(filtered);

        var bookingRows = filtered
            .OrderByDescending(x => x.AppointmentDate)
            .ThenByDescending(x => x.StartTime)
            .Select(x => new ReportBookingResponse(
                x.PublicId,
                x.BookingCode,
                x.CustomerName,
                x.CustomerPhone ?? string.Empty,
                string.Join(", ", ReportServiceLines(x)
                    .Where(s => s.Name != HistoricalAdjustmentLabel)
                    .Select(s => s.Name)
                    .Distinct(StringComparer.OrdinalIgnoreCase)),
                x.Barber.FullName,
                x.AppointmentDate.ToString("yyyy-MM-dd"),
                x.StartTime.ToString("h:mm tt", CultureInfo.InvariantCulture),
                x.Status.ToString(),
                x.TotalAmount
            ))
            .ToList();

        return new ReportsResponse(
            dateFrom.ToString("yyyy-MM-dd"),
            dateTo.ToString("yyyy-MM-dd"),
            barberOptions,
            new ReportsSummaryResponse(
                totalBookings,
                completedBookings,
                cancelledBookings,
                bookedValue,
                completedRevenue,
                averageCompletedTicket,
                completionRate
            ),
            services,
            barbers,
            daily,
            bookingRows
        );
    }

    private static IReadOnlyList<ServiceReportRowResponse> BuildServiceRows(
        IReadOnlyList<Booking> bookings)
    {
        var groups = bookings
            .Where(x => x.Status != BookingStatus.Cancelled)
            .SelectMany(booking => ReportServiceLines(booking).Select(service => new
            {
                Booking = booking,
                Service = service
            }))
            .GroupBy(x => x.Service.Name, StringComparer.OrdinalIgnoreCase)
            .Select(group => new
            {
                Name = group.First().Service.Name,
                Bookings = group.Count(),
                Completed = group.Count(x => x.Booking.Status == BookingStatus.Completed),
                Value = group.Sum(x => x.Service.Amount)
            })
            .OrderByDescending(x => x.Bookings)
            .ThenByDescending(x => x.Value)
            .ToList();

        var maxBookings = Math.Max(1, groups.Count == 0 ? 0 : groups.Max(x => x.Bookings));

        return groups.Select(x => new ServiceReportRowResponse(
            x.Name,
            x.Bookings,
            x.Completed,
            x.Value,
            (int)Math.Round(x.Bookings * 100m / maxBookings)
        )).ToList();
    }

    private const string CustomServiceLabel = "Custom Home Service";
    private const string HistoricalAdjustmentLabel = "Historical adjustment";

    private sealed record ReportServiceLine(string Name, decimal Amount);

    private static IReadOnlyList<ReportServiceLine> ReportServiceLines(Booking booking)
    {
        // Reports must reconcile to the immutable booking total without rewriting
        // historical snapshots or guessing old catalogue prices.
        var lines = booking.Services
            .OrderBy(x => x.SortOrder)
            .Where(x => !(x.ServiceId is null
                          && x.ServiceName.Equals(CustomServiceLabel, StringComparison.OrdinalIgnoreCase)))
            .Select(x => new ReportServiceLine(x.ServiceName, x.Amount))
            .ToList();

        var storedCustomLine = booking.Services
            .FirstOrDefault(x => x.ServiceId is null
                                 && x.ServiceName.Equals(CustomServiceLabel, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(booking.SpecialService) || storedCustomLine is not null)
        {
            // SpecialServiceAmount is the authoritative booking-level snapshot when
            // present. Older rows may have no custom BookingService line at all.
            var customAmount = booking.SpecialServiceAmount ?? storedCustomLine?.Amount ?? 0;
            lines.Add(new ReportServiceLine(CustomServiceLabel, customAmount));
        }

        var allocated = lines.Sum(x => x.Amount);
        var remainder = booking.TotalAmount - allocated;
        if (remainder != 0)
        {
            // Never backfill old catalogue prices from today's service table. Put any
            // unexplained historical remainder in a visible reconciliation row so
            // service totals still equal the booking ledger total.
            lines.Add(new ReportServiceLine(HistoricalAdjustmentLabel, remainder));
        }

        return lines;
    }

    private static IReadOnlyList<BarberReportRowResponse> BuildBarberRows(
        IReadOnlyList<Booking> bookings)
    {
        var groups = bookings
            .GroupBy(x => x.Barber.FullName, StringComparer.OrdinalIgnoreCase)
            .Select(group => new
            {
                Name = group.First().Barber.FullName,
                Bookings = group.Count(),
                Completed = group.Count(x => x.Status == BookingStatus.Completed),
                Cancelled = group.Count(x => x.Status == BookingStatus.Cancelled),
                Value = group
                    .Where(x => x.Status != BookingStatus.Cancelled)
                    .Sum(x => x.TotalAmount)
            })
            .OrderByDescending(x => x.Bookings)
            .ThenByDescending(x => x.Value)
            .ToList();

        var maxBookings = Math.Max(1, groups.Count == 0 ? 0 : groups.Max(x => x.Bookings));

        return groups.Select(x => new BarberReportRowResponse(
            x.Name,
            x.Bookings,
            x.Completed,
            x.Cancelled,
            x.Value,
            (int)Math.Round(x.Bookings * 100m / maxBookings)
        )).ToList();
    }

    private static IReadOnlyList<DailyReportRowResponse> BuildDailyRows(
        IReadOnlyList<Booking> bookings)
        => bookings
            .GroupBy(x => x.AppointmentDate)
            .Select(group => new DailyReportRowResponse(
                group.Key.ToString("yyyy-MM-dd"),
                group.Count(),
                group.Count(x => x.Status == BookingStatus.Completed),
                group.Count(x => x.Status == BookingStatus.Cancelled),
                group
                    .Where(x => x.Status == BookingStatus.Completed)
                    .Sum(x => x.TotalAmount),
                group
                    .Where(x => x.Status != BookingStatus.Cancelled)
                    .Sum(x => x.TotalAmount)
            ))
            .OrderByDescending(x => x.Date)
            .ToList();
}
