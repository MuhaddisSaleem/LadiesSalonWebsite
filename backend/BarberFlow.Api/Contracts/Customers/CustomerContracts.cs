using BarberFlow.Api.Contracts.Bookings;

namespace BarberFlow.Api.Contracts.Customers;

public sealed record CustomerResponse(
    string Id,
    string Name,
    string Phone,
    string Email,
    int BookingCount,
    int CompletedVisits,
    int CancelledCount,
    decimal TotalSpend,
    string? LastVisit,
    BookingResponse? NextBooking,
    string CustomerType,
    string FirstBookingDate,
    string LastBookingDate,
    string Notes,
    IReadOnlyList<BookingResponse> Bookings
);

public sealed record CustomerNotesRequest(string Notes);

public sealed record CustomerProfileUpdateRequest(
    string Name,
    string? Phone,
    string? Email
);

public sealed record CustomerMutationResponse(
    bool Success,
    string Message,
    CustomerResponse? Customer = null
);
