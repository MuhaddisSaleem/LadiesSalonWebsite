using BarberFlow.Api.Domain.Common;
using BarberFlow.Api.Domain.Enums;

namespace BarberFlow.Api.Domain.Entities;

public sealed class SalonUser : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;

    public required string FullName { get; set; }
    public required string Email { get; set; }
    public string? PasswordHash { get; set; }
    public SalonUserRole Role { get; set; } = SalonUserRole.Receptionist;
    public bool IsActive { get; set; } = true;
}
