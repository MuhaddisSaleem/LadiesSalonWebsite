namespace BarberFlow.Api.Contracts.Notifications;

public sealed record NotificationResponse(
    string Id,
    string Type,
    string Title,
    string Message,
    DateTimeOffset CreatedAt,
    string Icon,
    bool Unread,
    string? Url
);

public sealed record CreateNotificationRequest(
    string Type,
    string Title,
    string Message,
    string Icon,
    string? Url
);

public sealed record NotificationMutationResponse(
    bool Success,
    string Message,
    NotificationResponse? Notification = null
);
