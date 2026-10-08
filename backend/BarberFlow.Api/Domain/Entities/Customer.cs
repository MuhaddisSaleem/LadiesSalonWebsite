using BarberFlow.Api.Domain.Common;

namespace BarberFlow.Api.Domain.Entities;

public sealed class Customer : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;

    public required string FullName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Notes { get; set; }

    public ICollection<Booking> Bookings { get; set; } = [];
}
