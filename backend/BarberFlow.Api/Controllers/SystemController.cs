using BarberFlow.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Route("api/system")]
public sealed class SystemController(BarberFlowDbContext dbContext) : ControllerBase
{
    [HttpGet("info")]
    public IActionResult Info()
    {
        return Ok(new
        {
            application = "BarberFlow.Api",
            stage = "backend-foundation",
            databaseProvider = dbContext.Database.ProviderName
        });
    }

    [HttpGet("database")]
    public async Task<IActionResult> Database(CancellationToken cancellationToken)
    {
        var canConnect = await dbContext.Database.CanConnectAsync(cancellationToken);

        return canConnect
            ? Ok(new { connected = true })
            : StatusCode(StatusCodes.Status503ServiceUnavailable, new { connected = false });
    }
}
