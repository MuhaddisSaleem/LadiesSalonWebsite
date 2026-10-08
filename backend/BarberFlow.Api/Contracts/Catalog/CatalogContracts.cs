namespace BarberFlow.Api.Contracts.Catalog;

public sealed record ServiceDto(
    int Id,
    string Name,
    int Duration,
    decimal OriginalPrice,
    decimal? DiscountPrice,
    bool HomeServiceEnabled,
    decimal? HomeOriginalPrice,
    decimal? HomeDiscountPrice,
    string Image,
    string Status,
    int? CategoryId = null,
    string? CategoryName = null
);

public sealed record ServiceUpsertRequest(
    string Name,
    int Duration,
    decimal OriginalPrice,
    decimal? DiscountPrice,
    bool HomeServiceEnabled,
    decimal? HomeOriginalPrice,
    decimal? HomeDiscountPrice,
    string Image,
    string Status,
    int? CategoryId = null
);


public sealed record ServiceCategoryDto(
    int Id,
    string Name,
    int SortOrder,
    string Status,
    int ServiceCount
);

public sealed record ServiceCategoryUpsertRequest(
    string Name,
    int SortOrder,
    string Status
);

public sealed record BarberDto(
    int Id,
    string Name,
    string Phone,
    string Experience,
    IReadOnlyList<string> Specialties,
    string WorkingHours,
    string Image,
    decimal Rating,
    string Availability,
    string AccountStatus,
    string? LeaveFrom,
    string? LeaveTo,
    string? Note
);

public sealed record BarberUpsertRequest(
    string Name,
    string Phone,
    string Experience,
    IReadOnlyList<string> Specialties,
    string WorkingHours,
    string Image,
    decimal Rating,
    string Availability,
    string AccountStatus,
    string? LeaveFrom,
    string? LeaveTo,
    string? Note
);

public sealed record BarberAvailabilityRequest(string Availability);
public sealed record BarberLeaveRequest(
    string Availability,
    string LeaveFrom,
    string LeaveTo,
    string? Note
);

public sealed record BusinessHoursDayDto(
    string Key,
    string Label,
    bool Enabled,
    string Open,
    string Close
);

public sealed record SettingsDto(
    string BusinessName,
    string BusinessPhone,
    string WhatsappNumber,
    string Email,
    string Address,
    string City,
    string Currency,
    string Timezone,
    string BrandSubtitle,
    string HeroEyebrow,
    string HeroHeadline,
    string HeroTagline,
    int BookingInterval,
    int MaxAdvanceDays,
    int CancellationHours,
    int LateArrivalMinutes,
    bool AllowSameDayBooking,
    bool AutoConfirmBookings,
    bool SendWhatsappConfirmation,
    bool SendSmsFallback,
    bool SendAppointmentReminder,
    int ReminderHoursBefore,
    bool NotifyOwnerOnNewBooking,
    IReadOnlyList<BusinessHoursDayDto> BusinessHours
);

public sealed record LegacyCatalogImportRequest(
    IReadOnlyList<ServiceDto>? Services,
    IReadOnlyList<BarberDto>? Barbers,
    SettingsDto? Settings
);

public sealed record MutationResponse<T>(bool Success, string Message, T? Item = default);
public sealed record MutationResponse(bool Success, string Message);
public sealed record LegacyImportResponse(bool Success, bool Imported, string Message);
