namespace BarberFlow.Api.Contracts.Dashboard;

public sealed record DashboardResponse(
    string BusinessName,
    string Today,
    DashboardSummaryResponse Summary,
    DashboardRevenueResponse Revenue,
    IReadOnlyList<DashboardAppointmentResponse> Appointments,
    IReadOnlyList<DashboardBarberLoadResponse> BarberLoad,
    IReadOnlyList<DashboardTopServiceResponse> TopServices,
    IReadOnlyList<DashboardRecentCustomerResponse> RecentCustomers
);

public sealed record DashboardSummaryResponse(
    int TodayBookings,
    int YesterdayBookings,
    int UpcomingToday,
    int Customers,
    int NewCustomersThisMonth,
    int ReturningCustomers,
    int ActiveBarbers,
    int AvailableBarbers
);

public sealed record DashboardRevenueResponse(
    decimal CompletedToday,
    decimal CompletedYesterday,
    decimal BookedToday,
    decimal OpenToday,
    decimal AverageBookingToday
);

public sealed record DashboardAppointmentResponse(
    int Id,
    string Time,
    string Customer,
    string Phone,
    string Service,
    string Barber,
    decimal Price,
    string Status
);

public sealed record DashboardBarberLoadResponse(
    int Id,
    string Name,
    int Percent,
    int Appointments,
    bool Available
);

public sealed record DashboardTopServiceResponse(
    string Name,
    int Bookings,
    int Percent,
    decimal Revenue
);

public sealed record DashboardRecentCustomerResponse(
    string Id,
    string Name,
    string Phone,
    int Visits,
    decimal Spend
);
