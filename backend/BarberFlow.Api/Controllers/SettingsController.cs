using BarberFlow.Api.Contracts.Catalog;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/settings")]
public sealed class SettingsController(CatalogApplicationService catalog) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<SettingsDto>> Get(CancellationToken cancellationToken)
        => Ok(await catalog.GetSettingsAsync(cancellationToken));

    [HttpPut]
    public async Task<ActionResult<MutationResponse<SettingsDto>>> Save(
        [FromBody] SettingsDto request,
        CancellationToken cancellationToken)
    {
        var result = await catalog.SaveSettingsAsync(request, cancellationToken);
        return result.Success ? Ok(result) : Conflict(result);
    }

    [HttpPost("reset")]
    public async Task<ActionResult<MutationResponse<SettingsDto>>> Reset(CancellationToken cancellationToken)
    {
        var result = await catalog.ResetSettingsAsync(cancellationToken);
        return result.Success ? Ok(result) : Conflict(result);
    }
}
