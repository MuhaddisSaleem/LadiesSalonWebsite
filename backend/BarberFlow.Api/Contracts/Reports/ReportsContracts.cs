namespace BarberFlow.Api.Contracts.Reports;

public sealed record ReportsResponse(
    string DateFrom,
    string DateTo,
    IReadOnlyList<string> Barbers,
    ReportsSummaryResponse Summary,
    IReadOnlyList<ServiceReportRowResponse> Services,
    IReadOnlyList<BarberReportRowResponse> BarberPerformance,
    IReadOnlyList<DailyReportRowResponse> Daily,
    IReadOnlyList<ReportBookingResponse> Bookings
);

public sealed record ReportsSummaryResponse(
    int TotalBookings,
    int CompletedBookings,
    int CancelledBookings,
    decimal BookedValue,
    decimal CompletedRevenue,
    decimal AverageCompletedTicket,
    int CompletionRate
);

public sealed record ServiceReportRowResponse(
    string Name,
    int Bookings,
    int Completed,
    decimal Value,
    int Percent
);

public sealed record BarberReportRowResponse(
    string Name,
    int Bookings,
    int Completed,
    int Cancelled,
    decimal Value,
    int Percent
);

public sealed record DailyReportRowResponse(
    string Date,
    int Bookings,
    int Completed,
    int Cancelled,
    decimal Revenue,
    decimal BookedValue
);

public sealed record ReportBookingResponse(
    int Id,
    string Code,
    string CustomerName,
    string Phone,
    string Service,
    string Barber,
    string Date,
    string Time,
    string Status,
    decimal Amount
);
