using System.Globalization;
using BarberFlow.Api.Contracts.WhatsApp;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Services;

public sealed class WhatsAppMessagingService(
    BarberFlowDbContext db,
    WhatsAppCloudApiClient client,
    IConfiguration configuration,
    ILogger<WhatsAppMessagingService> logger)
{
    private const string BookingConfirmationType = "BookingConfirmation";

    public WhatsAppReadinessResponse GetReadiness()
        => new(
            configuration.GetValue<bool>("WhatsApp:Enabled"),
            client.IsConfigured,
            configuration["WhatsApp:GraphApiVersion"] ?? string.Empty,
            configuration["WhatsApp:PhoneNumberId"] ?? string.Empty,
            configuration["WhatsApp:BusinessAccountId"] ?? string.Empty,
            configuration["WhatsApp:ConfirmationTemplateName"] ?? "booking_confirmation",
            configuration["WhatsApp:TemplateLanguageCode"] ?? "en_US"
        );

    public async Task<IReadOnlyList<WhatsAppMessageResponse>> GetRecentMessagesAsync(
        Guid salonId,
        CancellationToken cancellationToken)
        => await db.WhatsAppMessages
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .Include(x => x.Booking)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(100)
            .Select(x => new WhatsAppMessageResponse(
                x.Id.ToString(),
                x.Booking.PublicId,
                x.Booking.BookingCode,
                x.Booking.CustomerName,
                x.RecipientPhone,
                x.MessageType,
                x.TemplateName,
                x.TemplateLanguage,
                x.Status,
                x.ProviderMessageId,
                x.FailureReason,
                x.SentAtUtc,
                x.CreatedAtUtc))
            .ToListAsync(cancellationToken);

    public async Task TrySendBookingConfirmationAsync(Guid bookingId, CancellationToken cancellationToken)
    {
        if (!client.IsConfigured) return;

        try
        {
            var booking = await db.Bookings
                .Include(x => x.Salon).ThenInclude(x => x.Settings)
                .Include(x => x.Barber)
                .Include(x => x.Services)
                .FirstOrDefaultAsync(x => x.Id == bookingId, cancellationToken);

            if (booking is null
                || booking.Status != BookingStatus.Confirmed
                || booking.Salon.Settings?.SendWhatsappConfirmation == false
                || string.IsNullOrWhiteSpace(booking.CustomerPhone))
                return;

            if (await db.WhatsAppMessages.AnyAsync(
                x => x.BookingId == booking.Id && x.MessageType == BookingConfirmationType,
                cancellationToken))
                return;

            var templateName = configuration["WhatsApp:ConfirmationTemplateName"] ?? "booking_confirmation";
            var languageCode = configuration["WhatsApp:TemplateLanguageCode"] ?? "en_US";

            var log = new WhatsAppMessage
            {
                SalonId = booking.SalonId,
                BookingId = booking.Id,
                MessageType = BookingConfirmationType,
                RecipientPhone = booking.CustomerPhone,
                TemplateName = templateName,
                TemplateLanguage = languageCode,
                Status = "Pending"
            };

            db.WhatsAppMessages.Add(log);
            await db.SaveChangesAsync(cancellationToken);

            var serviceNames = string.Join(", ", booking.Services.OrderBy(x => x.SortOrder).Select(x => x.ServiceName));
            var parameters = new[]
            {
                booking.CustomerName,
                booking.Salon.Name,
                serviceNames,
                booking.Barber.FullName,
                booking.AppointmentDate.ToString("dd MMM yyyy", CultureInfo.InvariantCulture),
                booking.StartTime.ToString("h:mm tt", CultureInfo.InvariantCulture),
                $"Rs. {booking.TotalAmount:N0}"
            };

            var result = await client.SendBookingConfirmationAsync(
                booking.CustomerPhone,
                parameters,
                cancellationToken);

            if (result.Success)
            {
                log.Status = "Sent";
                log.ProviderMessageId = result.ProviderMessageId;
                log.FailureReason = null;
                log.SentAtUtc = DateTimeOffset.UtcNow;
            }
            else
            {
                log.Status = "Failed";
                log.FailureReason = TrimFailure(result.Error);
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "WhatsApp confirmation failed after booking {BookingId} was saved. The booking remains valid.",
                bookingId);
        }
    }

    private static string? TrimFailure(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= 2000 ? trimmed : trimmed[..2000];
    }
}
