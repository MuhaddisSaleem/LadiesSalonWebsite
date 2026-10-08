using BarberFlow.Api.Domain.Common;

namespace BarberFlow.Api.Domain.Entities;

public sealed class WhatsAppMessage : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;
    public Guid BookingId { get; set; }
    public Booking Booking { get; set; } = null!;
    public string MessageType { get; set; } = "BookingConfirmation";
    public required string RecipientPhone { get; set; }
    public required string TemplateName { get; set; }
    public required string TemplateLanguage { get; set; }
    public string Status { get; set; } = "Pending";
    public string? ProviderMessageId { get; set; }
    public string? FailureReason { get; set; }
    public DateTimeOffset? SentAtUtc { get; set; }
}
