using BarberFlow.Api.Domain.Common;

namespace BarberFlow.Api.Domain.Entities;

public sealed class ServiceCategory : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;

    public int PublicId { get; set; }
    public required string Name { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Service> Services { get; set; } = [];
}
