using BarberFlow.Api.Contracts.Catalog;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/barbers")]
public sealed class BarbersController(CatalogApplicationService catalog) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BarberDto>>> GetAll(CancellationToken cancellationToken)
        => Ok(await catalog.GetBarbersAsync(cancellationToken));

    [HttpPost]
    public async Task<ActionResult<MutationResponse<BarberDto>>> Add(
        [FromBody] BarberUpsertRequest request,
        CancellationToken cancellationToken)
        => ToResult(await catalog.AddBarberAsync(request, cancellationToken));

    [HttpPut("{id:int}")]
    public async Task<ActionResult<MutationResponse<BarberDto>>> Update(
        int id,
        [FromBody] BarberUpsertRequest request,
        CancellationToken cancellationToken)
        => ToResult(await catalog.UpdateBarberAsync(id, request, cancellationToken));

    [HttpPatch("{id:int}/availability")]
    public async Task<ActionResult<MutationResponse<BarberDto>>> Availability(
        int id,
        [FromBody] BarberAvailabilityRequest request,
        CancellationToken cancellationToken)
        => ToResult(await catalog.UpdateAvailabilityAsync(id, request.Availability, cancellationToken));

    [HttpPut("{id:int}/leave")]
    public async Task<ActionResult<MutationResponse<BarberDto>>> Leave(
        int id,
        [FromBody] BarberLeaveRequest request,
        CancellationToken cancellationToken)
        => ToResult(await catalog.UpdateLeaveAsync(id, request, cancellationToken));

    [HttpPatch("{id:int}/status")]
    public async Task<ActionResult<MutationResponse<BarberDto>>> ToggleStatus(
        int id,
        CancellationToken cancellationToken)
        => ToResult(await catalog.ToggleBarberStatusAsync(id, cancellationToken));

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<MutationResponse>> Delete(int id, CancellationToken cancellationToken)
    {
        var result = await catalog.DeleteBarberAsync(id, cancellationToken);
        return result.Success ? Ok(result) : Conflict(result);
    }

    private ActionResult<MutationResponse<BarberDto>> ToResult(MutationResponse<BarberDto> result)
        => result.Success ? Ok(result) : Conflict(result);
}
