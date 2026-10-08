using BarberFlow.Api.Domain.Common;

namespace BarberFlow.Api.Domain.Entities;

public sealed class AccountVerificationCode : BaseEntity
{
    public Guid SalonUserId { get; set; }
    public SalonUser SalonUser { get; set; } = null!;

    public required string Purpose { get; set; }
    public required string DestinationEmail { get; set; }
    public required string CodeHash { get; set; }

    public DateTimeOffset ExpiresAtUtc { get; set; }
    public int AttemptCount { get; set; }
    public bool IsUsed { get; set; }
}
