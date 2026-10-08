using BarberFlow.Api.Domain.Common;

namespace BarberFlow.Api.Domain.Entities;

public sealed class SalonNotification : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;
    public required string Type { get; set; }
    public required string Title { get; set; }
    public required string Message { get; set; }
    public required string Icon { get; set; }
    public string? Url { get; set; }
    public bool IsRead { get; set; }
}
