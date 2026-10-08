using BarberFlow.Api.Contracts.Notifications;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Services;

public sealed class NotificationApplicationService(BarberFlowDbContext db)
{
    private static readonly HashSet<string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "booking", "payment", "cancelled", "rescheduled", "reminder", "system"
    };

    public async Task<IReadOnlyList<NotificationResponse>> GetAllAsync(Guid salonId, CancellationToken cancellationToken)
    {
        var notifications = await db.Notifications
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(100)
            .ToListAsync(cancellationToken);

        return notifications.Select(Map).ToList();
    }

    public async Task<NotificationMutationResponse> CreateAsync(
        Guid salonId,
        CreateNotificationRequest request,
        CancellationToken cancellationToken)
    {
        var title = (request.Title ?? string.Empty).Trim();
        var message = (request.Message ?? string.Empty).Trim();
        var icon = (request.Icon ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(message))
            return new(false, "Notification title and message are required.");

        if (title.Length > 160 || message.Length > 1000)
            return new(false, "Notification content is too long.");

        var notification = new SalonNotification
        {
            SalonId = salonId,
            Type = NormalizeType(request.Type),
            Title = title,
            Message = message,
            Icon = string.IsNullOrWhiteSpace(icon) ? "bi-bell" : icon[..Math.Min(icon.Length, 80)],
            Url = NormalizeUrl(request.Url),
            IsRead = false
        };

        db.Notifications.Add(notification);
        await db.SaveChangesAsync(cancellationToken);
        await TrimOldNotificationsAsync(salonId, cancellationToken);

        return new(true, "Notification created.", Map(notification));
    }

    public async Task<bool> MarkAsReadAsync(Guid salonId, Guid id, CancellationToken cancellationToken)
    {
        var notification = await db.Notifications
            .FirstOrDefaultAsync(x => x.SalonId == salonId && x.Id == id, cancellationToken);

        if (notification is null) return false;

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            await db.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task MarkAllAsReadAsync(Guid salonId, CancellationToken cancellationToken)
    {
        await db.Notifications
            .Where(x => x.SalonId == salonId && !x.IsRead)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(x => x.IsRead, true)
                    .SetProperty(x => x.UpdatedAtUtc, DateTimeOffset.UtcNow),
                cancellationToken);
    }

    public async Task ClearAsync(Guid salonId, CancellationToken cancellationToken)
    {
        await db.Notifications
            .Where(x => x.SalonId == salonId)
            .ExecuteDeleteAsync(cancellationToken);
    }

    private async Task TrimOldNotificationsAsync(Guid salonId, CancellationToken cancellationToken)
    {
        var keepIds = await db.Notifications
            .AsNoTracking()
            .Where(x => x.SalonId == salonId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(100)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);

        if (keepIds.Count < 100) return;

        await db.Notifications
            .Where(x => x.SalonId == salonId && !keepIds.Contains(x.Id))
            .ExecuteDeleteAsync(cancellationToken);
    }

    private static string NormalizeType(string? type)
    {
        var value = (type ?? string.Empty).Trim().ToLowerInvariant();
        return AllowedTypes.Contains(value) ? value : "system";
    }

    private static string? NormalizeUrl(string? url)
    {
        var value = (url ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!value.StartsWith("/", StringComparison.Ordinal) || value.StartsWith("//", StringComparison.Ordinal)) return null;
        return value[..Math.Min(value.Length, 500)];
    }

    public static NotificationResponse Map(SalonNotification notification)
        => new(
            notification.Id.ToString(),
            notification.Type,
            notification.Title,
            notification.Message,
            notification.CreatedAtUtc,
            notification.Icon,
            !notification.IsRead,
            notification.Url
        );
}
