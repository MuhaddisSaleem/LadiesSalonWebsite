using System.IdentityModel.Tokens.Jwt;
using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BarberFlow.Api.Contracts.Auth;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace BarberFlow.Api.Services;

public sealed class AuthApplicationService(
    BarberFlowDbContext db,
    IPasswordHasher<SalonUser> passwordHasher,
    IConfiguration configuration,
    AccountEmailService accountEmail)
{
    private const string DefaultSalonSlug = "royal-barbers";
    private const string PasswordResetPurpose = "password-reset";
    private const string EmailChangePurpose = "email-change";
    private const int VerificationExpiryMinutes = 10;
    private const int VerificationMaxAttempts = 5;
    private static readonly TimeSpan VerificationResendDelay = TimeSpan.FromSeconds(60);

    public async Task<LoginResponse> LoginAsync(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(request.Password))
            return new(false, "Email and password are required.");

        var user = await db.SalonUsers
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(
                x => x.Salon.Slug == DefaultSalonSlug && x.Email.ToLower() == email,
                cancellationToken);

        if (user is null || !user.IsActive || string.IsNullOrWhiteSpace(user.PasswordHash))
            return new(false, "Invalid email or password.");

        var verification = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verification == PasswordVerificationResult.Failed)
            return new(false, "Invalid email or password.");

        if (verification == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
            await db.SaveChangesAsync(cancellationToken);
        }

        var now = DateTimeOffset.UtcNow;
        var expiresAt = request.RememberMe
            ? now.AddDays(configuration.GetValue<int?>("Jwt:RememberMeDays") ?? 7)
            : now.AddMinutes(configuration.GetValue<int?>("Jwt:AccessTokenMinutes") ?? 480);

        var token = CreateToken(user, expiresAt);
        return new(
            true,
            "Login successful.",
            token,
            expiresAt,
            MapUser(user));
    }

    public async Task<AuthUserDto?> GetCurrentUserAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken)
    {
        var user = await FindCurrentUserAsync(principal, cancellationToken, asTracking: false);
        return user is null ? null : MapUser(user);
    }

    public async Task<AuthMutationResponse> ChangePasswordAsync(
        ClaimsPrincipal principal,
        ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var user = await FindCurrentUserAsync(principal, cancellationToken);
        if (user is null) return new(false, "Your admin session is no longer valid.");

        if (string.IsNullOrWhiteSpace(user.PasswordHash))
            return new(false, "This account does not have a password configured.");

        var currentCheck = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword);
        if (currentCheck == PasswordVerificationResult.Failed)
            return new(false, "Current password is incorrect.");

        var passwordError = ValidateNewPassword(request.NewPassword);
        if (passwordError is not null) return new(false, passwordError);

        var samePassword = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.NewPassword);
        if (samePassword != PasswordVerificationResult.Failed)
            return new(false, "Choose a new password that is different from your current password.");

        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        await db.SaveChangesAsync(cancellationToken);

        // Never report success until the new hash has actually been persisted
        // and can verify the requested password from a fresh database read.
        var persistedUser = await db.SalonUsers
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == user.Id && x.IsActive,
                cancellationToken);

        if (persistedUser is null
            || string.IsNullOrWhiteSpace(persistedUser.PasswordHash)
            || passwordHasher.VerifyHashedPassword(
                persistedUser,
                persistedUser.PasswordHash,
                request.NewPassword) == PasswordVerificationResult.Failed)
        {
            return new(false, "The password could not be verified after saving. Please retry.");
        }

        return new(true, "Password changed and saved successfully.", MapUser(persistedUser));
    }

    public async Task<AuthMutationResponse> RequestEmailChangeAsync(
        ClaimsPrincipal principal,
        RequestEmailChangeRequest request,
        CancellationToken cancellationToken)
    {
        var user = await FindCurrentUserAsync(principal, cancellationToken);
        if (user is null) return new(false, "Your admin session is no longer valid.");

        var newEmail = NormalizeEmail(request.NewEmail);
        if (!IsValidEmail(newEmail))
            return new(false, "Enter a valid new login email address.");

        if (string.Equals(user.Email, newEmail, StringComparison.OrdinalIgnoreCase))
            return new(false, "The new email is the same as your current login email.");

        if (string.IsNullOrWhiteSpace(user.PasswordHash)
            || passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword)
                == PasswordVerificationResult.Failed)
        {
            return new(false, "Current password is incorrect.");
        }

        var emailInUse = await db.SalonUsers.AnyAsync(
            x => x.SalonId == user.SalonId
                 && x.Id != user.Id
                 && x.Email.ToLower() == newEmail,
            cancellationToken);

        if (emailInUse)
            return new(false, "Another admin account already uses this email address.");

        if (!accountEmail.IsConfigured)
            return new(false, "Verification email is not configured yet. Configure the SMTP email settings first.");

        if (await IsWithinResendWindowAsync(user.Id, EmailChangePurpose, cancellationToken))
            return new(false, "Please wait 60 seconds before requesting another verification code.");

        var (entry, code) = CreateVerificationCode(user, EmailChangePurpose, newEmail);
        db.AccountVerificationCodes.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            await accountEmail.SendVerificationCodeAsync(
                newEmail,
                user.FullName,
                code,
                EmailChangePurpose,
                cancellationToken);
        }
        catch
        {
            entry.IsUsed = true;
            await db.SaveChangesAsync(cancellationToken);
            return new(false, "The verification email could not be sent. Please check the email configuration and try again.");
        }

        return new(true, "A 6-digit verification code was sent to your new email address.");
    }

    public async Task<AuthMutationResponse> ConfirmEmailChangeAsync(
        ClaimsPrincipal principal,
        ConfirmEmailChangeRequest request,
        CancellationToken cancellationToken)
    {
        var user = await FindCurrentUserAsync(principal, cancellationToken);
        if (user is null) return new(false, "Your admin session is no longer valid.");

        var newEmail = NormalizeEmail(request.NewEmail);
        if (!IsValidEmail(newEmail))
            return new(false, "Enter a valid new login email address.");

        var entry = await GetLatestVerificationCodeAsync(
            user.Id,
            EmailChangePurpose,
            newEmail,
            cancellationToken);

        var codeError = await ValidateVerificationCodeAsync(entry, request.Code, user.PasswordHash, cancellationToken);
        if (codeError is not null) return new(false, codeError);

        var emailInUse = await db.SalonUsers.AnyAsync(
            x => x.SalonId == user.SalonId
                 && x.Id != user.Id
                 && x.Email.ToLower() == newEmail,
            cancellationToken);

        if (emailInUse)
        {
            entry!.IsUsed = true;
            await db.SaveChangesAsync(cancellationToken);
            return new(false, "Another admin account already uses this email address.");
        }

        user.Email = newEmail;
        entry!.IsUsed = true;
        await InvalidateVerificationCodesAsync(user.Id, cancellationToken, exceptId: entry.Id);
        await db.SaveChangesAsync(cancellationToken);

        return new(true, "Login email changed successfully.", MapUser(user));
    }

    public async Task<AuthMutationResponse> RequestPasswordResetAsync(
        PasswordResetRequest request,
        CancellationToken cancellationToken)
    {
        if (!accountEmail.IsConfigured)
            return new(false, "Password recovery email is not configured yet.");

        var email = NormalizeEmail(request.Email);
        var genericMessage = "If this email is registered, a 6-digit verification code has been sent.";

        if (!IsValidEmail(email))
            return new(true, genericMessage);

        var user = await db.SalonUsers
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(
                x => x.Salon.Slug == DefaultSalonSlug
                     && x.IsActive
                     && x.Email.ToLower() == email,
                cancellationToken);

        if (user is null)
        {
            await Task.Delay(150, cancellationToken);
            return new(true, genericMessage);
        }

        if (await IsWithinResendWindowAsync(user.Id, PasswordResetPurpose, cancellationToken))
            return new(true, genericMessage);

        var (entry, code) = CreateVerificationCode(user, PasswordResetPurpose, email);
        db.AccountVerificationCodes.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        try
        {
            await accountEmail.SendVerificationCodeAsync(
                email,
                user.FullName,
                code,
                PasswordResetPurpose,
                cancellationToken);
        }
        catch
        {
            entry.IsUsed = true;
            await db.SaveChangesAsync(cancellationToken);

            // Keep the response generic so account existence is never disclosed.
            return new(true, genericMessage);
        }

        return new(true, genericMessage);
    }

    public async Task<AuthMutationResponse> ConfirmPasswordResetAsync(
        ConfirmPasswordResetRequest request,
        CancellationToken cancellationToken)
    {
        var email = NormalizeEmail(request.Email);
        var passwordError = ValidateNewPassword(request.NewPassword);
        if (passwordError is not null) return new(false, passwordError);

        var user = await db.SalonUsers
            .Include(x => x.Salon)
            .FirstOrDefaultAsync(
                x => x.Salon.Slug == DefaultSalonSlug
                     && x.IsActive
                     && x.Email.ToLower() == email,
                cancellationToken);

        if (user is null)
            return new(false, "The verification code is invalid or has expired.");

        var entry = await GetLatestVerificationCodeAsync(
            user.Id,
            PasswordResetPurpose,
            email,
            cancellationToken);

        var codeError = await ValidateVerificationCodeAsync(entry, request.Code, user.PasswordHash, cancellationToken);
        if (codeError is not null) return new(false, codeError);

        if (!string.IsNullOrWhiteSpace(user.PasswordHash))
        {
            var samePassword = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.NewPassword);
            if (samePassword != PasswordVerificationResult.Failed)
                return new(false, "Choose a new password that is different from your previous password.");
        }

        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        entry!.IsUsed = true;
        await InvalidateVerificationCodesAsync(user.Id, cancellationToken, exceptId: entry.Id);
        await db.SaveChangesAsync(cancellationToken);

        return new(true, "Password reset successfully. You can now sign in with your new password.");
    }

    private async Task<SalonUser?> FindCurrentUserAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken,
        bool asTracking = true)
    {
        var rawId = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                    ?? principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (!Guid.TryParse(rawId, out var userId))
            return null;

        IQueryable<SalonUser> query = db.SalonUsers;
        if (!asTracking) query = query.AsNoTracking();

        return await query.FirstOrDefaultAsync(
            x => x.Id == userId && x.IsActive,
            cancellationToken);
    }

    private (AccountVerificationCode Entry, string Code) CreateVerificationCode(
        SalonUser user,
        string purpose,
        string destinationEmail)
    {
        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var entry = new AccountVerificationCode
        {
            SalonUserId = user.Id,
            SalonUser = user,
            Purpose = purpose,
            DestinationEmail = destinationEmail,
            CodeHash = "",
            ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(VerificationExpiryMinutes),
            AttemptCount = 0,
            IsUsed = false
        };

        entry.CodeHash = HashVerificationCode(entry.Id, code, user.PasswordHash);
        return (entry, code);
    }

    private async Task<AccountVerificationCode?> GetLatestVerificationCodeAsync(
        Guid userId,
        string purpose,
        string destinationEmail,
        CancellationToken cancellationToken)
        => await db.AccountVerificationCodes
            .Where(x => x.SalonUserId == userId
                        && x.Purpose == purpose
                        && x.DestinationEmail == destinationEmail
                        && !x.IsUsed)
            .OrderByDescending(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

    private async Task<string?> ValidateVerificationCodeAsync(
        AccountVerificationCode? entry,
        string rawCode,
        string? currentPasswordHash,
        CancellationToken cancellationToken)
    {
        if (entry is null || entry.ExpiresAtUtc <= DateTimeOffset.UtcNow)
        {
            if (entry is not null && !entry.IsUsed)
            {
                entry.IsUsed = true;
                await db.SaveChangesAsync(cancellationToken);
            }

            return "The verification code is invalid or has expired.";
        }

        if (entry.AttemptCount >= VerificationMaxAttempts)
        {
            entry.IsUsed = true;
            await db.SaveChangesAsync(cancellationToken);
            return "Too many incorrect attempts. Request a new verification code.";
        }

        var code = new string((rawCode ?? "").Where(char.IsDigit).ToArray());
        var matches = code.Length == 6 && VerificationCodeMatches(entry, code, currentPasswordHash);

        if (!matches)
        {
            entry.AttemptCount++;
            if (entry.AttemptCount >= VerificationMaxAttempts)
                entry.IsUsed = true;

            await db.SaveChangesAsync(cancellationToken);
            return entry.IsUsed
                ? "Too many incorrect attempts. Request a new verification code."
                : "The verification code is invalid or has expired.";
        }

        return null;
    }

    private async Task<bool> IsWithinResendWindowAsync(
        Guid userId,
        string purpose,
        CancellationToken cancellationToken)
    {
        var latest = await db.AccountVerificationCodes
            .Where(x => x.SalonUserId == userId && x.Purpose == purpose)
            .OrderByDescending(x => x.CreatedAtUtc)
            .Select(x => (DateTimeOffset?)x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return latest.HasValue
               && DateTimeOffset.UtcNow - latest.Value < VerificationResendDelay;
    }

    private async Task InvalidateVerificationCodesAsync(
        Guid userId,
        CancellationToken cancellationToken,
        Guid? exceptId = null)
    {
        IQueryable<AccountVerificationCode> query = db.AccountVerificationCodes
            .Where(x => x.SalonUserId == userId && !x.IsUsed);

        if (exceptId.HasValue)
        {
            var preservedId = exceptId.Value;
            query = query.Where(x => x.Id != preservedId);
        }

        var activeCodes = await query.ToListAsync(cancellationToken);

        foreach (var code in activeCodes)
            code.IsUsed = true;
    }

    private string HashVerificationCode(Guid requestId, string code, string? passwordHash)
    {
        var signingKey = configuration["Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(signingKey))
            throw new InvalidOperationException("Jwt:SigningKey is required.");

        var passwordFingerprint = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(passwordHash ?? string.Empty)));

        var payload = Encoding.UTF8.GetBytes(
            $"{requestId:N}:{code}:{passwordFingerprint}:{signingKey}");

        return Convert.ToHexString(SHA256.HashData(payload));
    }

    private bool VerificationCodeMatches(
        AccountVerificationCode entry,
        string code,
        string? currentPasswordHash)
    {
        var expected = Convert.FromHexString(entry.CodeHash);
        var actual = Convert.FromHexString(
            HashVerificationCode(entry.Id, code, currentPasswordHash));

        return CryptographicOperations.FixedTimeEquals(expected, actual);
    }

    private static string NormalizeEmail(string? email)
        => (email ?? "").Trim().ToLowerInvariant();

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254) return false;

        try
        {
            return string.Equals(new MailAddress(email).Address, email, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static string? ValidateNewPassword(string? password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
            return "Password must contain at least 8 characters.";

        if (password.Length > 128)
            return "Password must be 128 characters or fewer.";

        if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit))
            return "Password must include at least one letter and one number.";

        return null;
    }

    private string CreateToken(SalonUser user, DateTimeOffset expiresAt)
    {
        var signingKey = configuration["Jwt:SigningKey"];
        if (string.IsNullOrWhiteSpace(signingKey) || signingKey.Length < 32)
            throw new InvalidOperationException("Jwt:SigningKey must be configured with at least 32 characters.");

        var issuer = configuration["Jwt:Issuer"] ?? "BarberFlow.Api";
        var audience = configuration["Jwt:Audience"] ?? "BarberFlow.Admin";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim("salon_id", user.SalonId.ToString()),
            new Claim(SessionStamp.Claim, SessionStamp.Create(user, signingKey)),
            new Claim(ClaimTypes.Name, user.FullName),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role.ToString())
        };

        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            notBefore: DateTime.UtcNow,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static AuthUserDto MapUser(SalonUser user)
        => new(user.Id, user.FullName, user.Email, user.Role.ToString());
}
