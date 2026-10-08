using System.Security.Claims;
using BarberFlow.Api.Contracts.Reports;
using BarberFlow.Api.Domain.Enums;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/reports")]
public sealed class ReportsController(ReportsApplicationService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ReportsResponse>> Get(
        [FromQuery] string from,
        [FromQuery] string to,
        [FromQuery] string? barber,
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue("salon_id"), out var salonId))
            return Unauthorized();

        if (!DateOnly.TryParse(from, out var dateFrom)
            || !DateOnly.TryParse(to, out var dateTo))
        {
            return BadRequest(new { message = "Select a valid report date range." });
        }

        if (dateTo < dateFrom)
            return BadRequest(new { message = "Report end date cannot be before the start date." });

        if (dateTo.DayNumber - dateFrom.DayNumber > 730)
            return BadRequest(new { message = "Report date range cannot exceed two years." });

        BookingStatus? parsedStatus = null;
        if (!string.IsNullOrWhiteSpace(status)
            && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (!Enum.TryParse<BookingStatus>(status, true, out var value))
                return BadRequest(new { message = "Invalid booking status filter." });

            parsedStatus = value;
        }

        var barberName = string.IsNullOrWhiteSpace(barber)
                         || barber.Equals("All", StringComparison.OrdinalIgnoreCase)
            ? null
            : barber.Trim();

        return Ok(await service.GetAsync(
            salonId,
            dateFrom,
            dateTo,
            barberName,
            parsedStatus,
            cancellationToken));
    }
}
