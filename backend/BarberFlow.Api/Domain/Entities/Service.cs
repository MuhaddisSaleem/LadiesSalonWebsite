using BarberFlow.Api.Domain.Common;

namespace BarberFlow.Api.Domain.Entities;

public sealed class Service : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;

    public int PublicId { get; set; }

    public Guid ServiceCategoryId { get; set; }
    public ServiceCategory ServiceCategory { get; set; } = null!;

    public required string Name { get; set; }
    public string? Description { get; set; }
    public int DurationMinutes { get; set; }
    public decimal OriginalPrice { get; set; }
    public decimal? DiscountPrice { get; set; }
    public bool HomeServiceEnabled { get; set; }
    public decimal? HomeOriginalPrice { get; set; }
    public decimal? HomeDiscountPrice { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<BarberService> Barbers { get; set; } = [];
    public ICollection<BookingService> BookingServices { get; set; } = [];
}
