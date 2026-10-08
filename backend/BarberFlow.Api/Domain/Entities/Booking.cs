using BarberFlow.Api.Domain.Common;
using BarberFlow.Api.Domain.Enums;

namespace BarberFlow.Api.Domain.Entities;

public sealed class Booking : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;

    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public Guid BarberId { get; set; }
    public Barber Barber { get; set; } = null!;

    public int PublicId { get; set; }
    public required string BookingCode { get; set; }

    // Snapshots preserve the booked customer details even if the customer profile changes later.
    public required string CustomerName { get; set; }
    public string? CustomerPhone { get; set; }

    public DateOnly AppointmentDate { get; set; }
    public TimeOnly StartTime { get; set; }
    public int TotalDurationMinutes { get; set; }
    public decimal TotalAmount { get; set; }

    public BookingStatus Status { get; set; } = BookingStatus.Pending;
    public BookingSource Source { get; set; } = BookingSource.Online;
    public ServiceLocation ServiceLocation { get; set; } = ServiceLocation.Salon;

    public int GroupSize { get; set; } = 1;
    public string? Notes { get; set; }
    public string? ServiceAddress { get; set; }
    public string? SpecialService { get; set; }
    public decimal? SpecialServiceAmount { get; set; }

    public ICollection<BookingService> Services { get; set; } = [];
    public ICollection<WhatsAppMessage> WhatsAppMessages { get; set; } = [];
}

public sealed class BookingService : BaseEntity
{
    public Guid BookingId { get; set; }
    public Booking Booking { get; set; } = null!;

    public Guid? ServiceId { get; set; }
    public Service? Service { get; set; }

    // Snapshots protect historical bookings from service rename/price changes.
    public required string ServiceName { get; set; }
    public int DurationMinutes { get; set; }
    public decimal Amount { get; set; }
    public int SortOrder { get; set; }
}
