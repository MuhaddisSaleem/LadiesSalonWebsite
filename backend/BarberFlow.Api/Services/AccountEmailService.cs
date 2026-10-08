using System.Net;
using System.Net.Mail;

namespace BarberFlow.Api.Services;

public sealed class AccountEmailService(
    IConfiguration configuration,
    ILogger<AccountEmailService> logger)
{
    public bool IsConfigured =>
        configuration.GetValue<bool>("Email:Enabled")
        && !string.IsNullOrWhiteSpace(configuration["Email:Host"])
        && configuration.GetValue<int?>("Email:Port") is > 0
        && !string.IsNullOrWhiteSpace(configuration["Email:SenderEmail"])
        && !string.IsNullOrWhiteSpace(configuration["Email:Username"])
        && !string.IsNullOrWhiteSpace(configuration["Email:Password"]);

    public async Task SendVerificationCodeAsync(
        string recipientEmail,
        string recipientName,
        string code,
        string purpose,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Account recovery email is not configured.");

        var host = configuration["Email:Host"]!;
        var port = configuration.GetValue<int>("Email:Port");
        var useSsl = configuration.GetValue("Email:UseSsl", true);
        var senderName = configuration["Email:SenderName"] ?? "The Trim Town";
        var senderEmail = configuration["Email:SenderEmail"]!;
        var username = configuration["Email:Username"]!;
        var password = configuration["Email:Password"]!;

        var isPasswordReset = purpose.Equals("password-reset", StringComparison.OrdinalIgnoreCase);
        var subject = isPasswordReset
            ? "The Trim Town password reset code"
            : "Confirm your new Trim Town admin email";

        var encodedName = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(recipientName) ? "Admin" : recipientName);
        var encodedCode = WebUtility.HtmlEncode(code);
        var actionText = isPasswordReset
            ? "reset your admin password"
            : "confirm this email as your new admin login address";

        using var message = new MailMessage
        {
            From = new MailAddress(senderEmail, senderName),
            Subject = subject,
            IsBodyHtml = true,
            Body = $"""
                <div style="font-family:Arial,sans-serif;background:#0b1113;color:#f3f4ef;padding:32px;">
                  <div style="max-width:520px;margin:0 auto;background:#10191c;border:1px solid #2a3539;border-radius:14px;padding:28px;">
                    <div style="color:#e9b654;font-size:12px;font-weight:700;letter-spacing:2px;">THE TRIM TOWN · SECURITY</div>
                    <h2 style="margin:14px 0 8px;color:#ffffff;font-size:25px;">Verification code</h2>
                    <p style="margin:0;color:#aab4b7;line-height:1.6;">Hello {encodedName}, use the code below to {actionText}.</p>
                    <div style="margin:26px 0;padding:18px;border:1px solid rgba(233,182,84,.35);border-radius:10px;background:#0c1416;text-align:center;color:#e9b654;font-size:34px;font-weight:800;letter-spacing:10px;">{encodedCode}</div>
                    <p style="margin:0;color:#879397;font-size:13px;line-height:1.6;">This code expires in 10 minutes and can only be used once.</p>
                    <p style="margin:16px 0 0;color:#68757a;font-size:12px;line-height:1.6;">If you did not request this change, you can safely ignore this email.</p>
                  </div>
                </div>
                """
        };
        message.To.Add(new MailAddress(recipientEmail));

        using var client = new SmtpClient(host, port)
        {
            EnableSsl = useSsl,
            Credentials = new NetworkCredential(username, password)
        };

        try
        {
            await client.SendMailAsync(message).WaitAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not send account verification email.");
            throw;
        }
    }
}
