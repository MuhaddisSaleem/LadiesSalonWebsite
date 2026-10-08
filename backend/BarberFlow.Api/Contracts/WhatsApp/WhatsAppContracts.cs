namespace BarberFlow.Api.Contracts.WhatsApp;

public sealed record WhatsAppReadinessResponse(
    bool Enabled,
    bool Configured,
    string GraphApiVersion,
    string PhoneNumberId,
    string BusinessAccountId,
    string ConfirmationTemplateName,
    string TemplateLanguageCode
);

public sealed record WhatsAppMessageResponse(
    string Id,
    int BookingId,
    string BookingCode,
    string CustomerName,
    string RecipientPhone,
    string MessageType,
    string TemplateName,
    string TemplateLanguage,
    string Status,
    string? ProviderMessageId,
    string? FailureReason,
    DateTimeOffset? SentAtUtc,
    DateTimeOffset CreatedAtUtc
);
