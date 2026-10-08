using BarberFlow.Api.Contracts.Catalog;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/services")]
public sealed class ServicesController(CatalogApplicationService catalog) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ServiceDto>>> GetAll(CancellationToken cancellationToken)
        => Ok(await catalog.GetServicesAsync(cancellationToken));

    [HttpPost]
    public async Task<ActionResult<MutationResponse<ServiceDto>>> Add(
        [FromBody] ServiceUpsertRequest request,
        CancellationToken cancellationToken)
        => ToResult(await catalog.AddServiceAsync(request, cancellationToken));

    [HttpPut("{id:int}")]
    public async Task<ActionResult<MutationResponse<ServiceDto>>> Update(
        int id,
        [FromBody] ServiceUpsertRequest request,
        CancellationToken cancellationToken)
        => ToResult(await catalog.UpdateServiceAsync(id, request, cancellationToken));

    [HttpPatch("{id:int}/status")]
    public async Task<ActionResult<MutationResponse<ServiceDto>>> ToggleStatus(
        int id,
        CancellationToken cancellationToken)
        => ToResult(await catalog.ToggleServiceStatusAsync(id, cancellationToken));

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<MutationResponse>> Delete(
        int id,
        CancellationToken cancellationToken)
    {
        var result = await catalog.DeleteServiceAsync(id, cancellationToken);
        return result.Success ? Ok(result) : Conflict(result);
    }

    private ActionResult<MutationResponse<ServiceDto>> ToResult(MutationResponse<ServiceDto> result)
        => result.Success ? Ok(result) : Conflict(result);
}
