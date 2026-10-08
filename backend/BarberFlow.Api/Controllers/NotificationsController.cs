using System.Security.Claims;
using BarberFlow.Api.Contracts.Notifications;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications")]
public sealed class NotificationsController(NotificationApplicationService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<NotificationResponse>>> GetAll(CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId)) return Unauthorized();
        return Ok(await service.GetAllAsync(salonId, cancellationToken));
    }

    [HttpPost]
    public async Task<ActionResult<NotificationMutationResponse>> Create(
        [FromBody] CreateNotificationRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId)) return Unauthorized();
        var result = await service.CreateAsync(salonId, request, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPatch("{id:guid}/read")]
    public async Task<IActionResult> MarkAsRead(Guid id, CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId)) return Unauthorized();
        return await service.MarkAsReadAsync(salonId, id, cancellationToken) ? NoContent() : NotFound();
    }

    [HttpPatch("read-all")]
    public async Task<IActionResult> MarkAllAsRead(CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId)) return Unauthorized();
        await service.MarkAllAsReadAsync(salonId, cancellationToken);
        return NoContent();
    }

    [HttpDelete]
    public async Task<IActionResult> Clear(CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId)) return Unauthorized();
        await service.ClearAsync(salonId, cancellationToken);
        return NoContent();
    }

    private bool TryGetSalonId(out Guid salonId)
        => Guid.TryParse(User.FindFirstValue("salon_id"), out salonId);
}
