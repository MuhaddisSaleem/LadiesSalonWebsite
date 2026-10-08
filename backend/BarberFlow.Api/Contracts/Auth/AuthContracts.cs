namespace BarberFlow.Api.Contracts.Auth;

public sealed record LoginRequest(
    string Email,
    string Password,
    bool RememberMe = false
);

public sealed record AuthUserDto(
    Guid Id,
    string FullName,
    string Email,
    string Role
);

public sealed record LoginResponse(
    bool Success,
    string Message,
    string? Token = null,
    DateTimeOffset? ExpiresAt = null,
    AuthUserDto? User = null
);


public sealed record ChangePasswordRequest(
    string CurrentPassword,
    string NewPassword
);

public sealed record RequestEmailChangeRequest(
    string CurrentPassword,
    string NewEmail
);

public sealed record ConfirmEmailChangeRequest(
    string NewEmail,
    string Code
);

public sealed record PasswordResetRequest(
    string Email
);

public sealed record ConfirmPasswordResetRequest(
    string Email,
    string Code,
    string NewPassword
);

public sealed record AuthMutationResponse(
    bool Success,
    string Message,
    AuthUserDto? User = null
);
