using System.Security.Claims;
using BarberFlow.Api.Contracts.WhatsApp;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/whatsapp")]
public sealed class WhatsAppController(WhatsAppMessagingService service) : ControllerBase
{
    [HttpGet("status")]
    public ActionResult<WhatsAppReadinessResponse> GetStatus()
    {
        if (!TryGetSalonId(out _)) return Unauthorized();
        return Ok(service.GetReadiness());
    }

    [HttpGet("messages")]
    public async Task<ActionResult<IReadOnlyList<WhatsAppMessageResponse>>> GetMessages(
        CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId)) return Unauthorized();
        return Ok(await service.GetRecentMessagesAsync(salonId, cancellationToken));
    }

    private bool TryGetSalonId(out Guid salonId)
        => Guid.TryParse(User.FindFirstValue("salon_id"), out salonId);
}
