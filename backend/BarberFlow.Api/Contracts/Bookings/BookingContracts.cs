namespace BarberFlow.Api.Contracts.Bookings;

public sealed record BookingRequest(
    string CustomerName,
    string? Phone,
    string Service,
    int Duration,
    string Barber,
    string Date,
    string Time,
    decimal Amount,
    string? Notes,
    int GroupSize,
    string ServiceLocation,
    string? ServiceAddress,
    string? SpecialService,
    decimal? SpecialServiceAmount,
    IReadOnlyList<string>? ServiceNames = null
);

public sealed record BookingResponse(
    int Id,
    string Code,
    string CustomerName,
    string Phone,
    string Service,
    int Duration,
    string Barber,
    string Date,
    string Time,
    decimal Amount,
    string Status,
    string Source,
    string Notes,
    int GroupSize,
    string ServiceLocation,
    string ServiceAddress,
    string SpecialService,
    decimal SpecialServiceAmount,
    IReadOnlyList<string>? ServiceNames = null
);

public sealed record BookingBusySlotResponse(
    int Id,
    string Barber,
    string Date,
    string Time,
    int Duration,
    string Status
);

public sealed record BookingMutationResponse(bool Success, string Message, BookingResponse? Booking = null);
public sealed record StatusUpdateRequest(string Status);
public sealed record BarberUpdateRequest(string Barber);
public sealed record ScheduleUpdateRequest(string Date, string Time);
public sealed record SpecialServicePriceRequest(decimal Amount);

public sealed record AvailabilityRequest(
    string Service,
    string Date,
    string Time,
    int Duration,
    string? Barber = null,
    int? IgnoreBookingId = null,
    string? ServiceLocation = null,
    IReadOnlyList<string>? ServiceNames = null,
    string? SpecialService = null
);

public sealed record AvailabilityResponse(
    bool Available,
    string Message,
    IReadOnlyList<string> EligibleBarbers
);
