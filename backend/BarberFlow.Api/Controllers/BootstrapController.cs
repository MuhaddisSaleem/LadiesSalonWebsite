using BarberFlow.Api.Contracts.Catalog;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/bootstrap")]
public sealed class BootstrapController(CatalogApplicationService catalog) : ControllerBase
{
    [HttpPost("legacy-catalog")]
    public async Task<ActionResult<LegacyImportResponse>> ImportLegacy(
        [FromBody] LegacyCatalogImportRequest request,
        CancellationToken cancellationToken)
    {
        var result = await catalog.ImportLegacyAsync(request, cancellationToken);
        return result.Success ? Ok(result) : Conflict(result);
    }
}
