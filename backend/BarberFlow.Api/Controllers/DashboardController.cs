using System.Security.Claims;
using BarberFlow.Api.Contracts.Dashboard;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/dashboard")]
public sealed class DashboardController(DashboardApplicationService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<DashboardResponse>> Get(
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue("salon_id"), out var salonId))
            return Unauthorized();

        var dashboard = await service.GetAsync(salonId, cancellationToken);
        return dashboard is null ? NotFound() : Ok(dashboard);
    }
}
