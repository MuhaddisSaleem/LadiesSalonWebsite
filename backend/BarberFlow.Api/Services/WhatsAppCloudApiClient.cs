using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace BarberFlow.Api.Services;

public sealed class WhatsAppCloudApiClient(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<WhatsAppCloudApiClient> logger)
{
    public bool IsConfigured
        => configuration.GetValue<bool>("WhatsApp:Enabled")
           && !string.IsNullOrWhiteSpace(configuration["WhatsApp:GraphApiVersion"])
           && !string.IsNullOrWhiteSpace(configuration["WhatsApp:PhoneNumberId"])
           && !string.IsNullOrWhiteSpace(configuration["WhatsApp:AccessToken"])
           && !string.IsNullOrWhiteSpace(configuration["WhatsApp:ConfirmationTemplateName"])
           && !string.IsNullOrWhiteSpace(configuration["WhatsApp:TemplateLanguageCode"]);

    public async Task<WhatsAppSendResult> SendBookingConfirmationAsync(
        string recipientPhone,
        IReadOnlyList<string> bodyParameters,
        CancellationToken cancellationToken)
    {
        if (!IsConfigured)
            return new(false, null, "WhatsApp Cloud API is not configured.");

        var version = configuration["WhatsApp:GraphApiVersion"]!.Trim();
        var phoneNumberId = configuration["WhatsApp:PhoneNumberId"]!.Trim();
        var accessToken = configuration["WhatsApp:AccessToken"]!.Trim();
        var templateName = configuration["WhatsApp:ConfirmationTemplateName"]!.Trim();
        var languageCode = configuration["WhatsApp:TemplateLanguageCode"]!.Trim();
        var recipient = new string(recipientPhone.Where(char.IsDigit).ToArray());

        if (string.IsNullOrWhiteSpace(recipient))
            return new(false, null, "Recipient phone number is missing.");

        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"https://graph.facebook.com/{version}/{phoneNumberId}/messages");

        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Content = JsonContent.Create(new
        {
            messaging_product = "whatsapp",
            to = recipient,
            type = "template",
            template = new
            {
                name = templateName,
                language = new { code = languageCode },
                components = new[]
                {
                    new
                    {
                        type = "body",
                        parameters = bodyParameters
                            .Select(value => new { type = "text", text = value })
                            .ToArray()
                    }
                }
            }
        });

        try
        {
            using var response = await httpClient.SendAsync(request, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
                return new(false, null, TryReadError(content) ?? $"Meta returned HTTP {(int)response.StatusCode}.");

            return new(true, TryReadMessageId(content), null);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new(false, null, "WhatsApp request timed out.");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "WhatsApp Cloud API request failed.");
            return new(false, null, ex.Message);
        }
    }

    private static string? TryReadMessageId(string content)
    {
        try
        {
            using var document = JsonDocument.Parse(content);
            var messages = document.RootElement.GetProperty("messages");
            return messages.GetArrayLength() > 0
                && messages[0].TryGetProperty("id", out var id)
                    ? id.GetString()
                    : null;
        }
        catch { return null; }
    }

    private static string? TryReadError(string content)
    {
        try
        {
            using var document = JsonDocument.Parse(content);
            return document.RootElement.TryGetProperty("error", out var error)
                   && error.TryGetProperty("message", out var message)
                ? message.GetString()
                : null;
        }
        catch
        {
            return content.Length > 500 ? content[..500] : content;
        }
    }
}

public sealed record WhatsAppSendResult(bool Success, string? ProviderMessageId, string? Error);
