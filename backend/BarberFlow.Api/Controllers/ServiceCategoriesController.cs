using BarberFlow.Api.Contracts.Catalog;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/service-categories")]
public sealed class ServiceCategoriesController(CatalogApplicationService catalog) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ServiceCategoryDto>>> GetAll(
        CancellationToken cancellationToken)
        => Ok(await catalog.GetServiceCategoriesAsync(cancellationToken));

    [HttpPost]
    public async Task<ActionResult<MutationResponse<ServiceCategoryDto>>> Add(
        [FromBody] ServiceCategoryUpsertRequest request,
        CancellationToken cancellationToken)
        => ToResult(await catalog.AddServiceCategoryAsync(request, cancellationToken));

    [HttpPut("{id:int}")]
    public async Task<ActionResult<MutationResponse<ServiceCategoryDto>>> Update(
        int id,
        [FromBody] ServiceCategoryUpsertRequest request,
        CancellationToken cancellationToken)
        => ToResult(await catalog.UpdateServiceCategoryAsync(id, request, cancellationToken));

    [HttpPatch("{id:int}/status")]
    public async Task<ActionResult<MutationResponse<ServiceCategoryDto>>> ToggleStatus(
        int id,
        CancellationToken cancellationToken)
        => ToResult(await catalog.ToggleServiceCategoryStatusAsync(id, cancellationToken));

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<MutationResponse>> Delete(
        int id,
        CancellationToken cancellationToken)
    {
        var result = await catalog.DeleteServiceCategoryAsync(id, cancellationToken);
        return result.Success ? Ok(result) : Conflict(result);
    }

    private ActionResult<MutationResponse<ServiceCategoryDto>> ToResult(
        MutationResponse<ServiceCategoryDto> result)
        => result.Success ? Ok(result) : Conflict(result);
}
