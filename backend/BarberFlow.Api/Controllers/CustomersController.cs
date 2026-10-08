using System.Security.Claims;
using BarberFlow.Api.Contracts.Customers;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/customers")]
public sealed class CustomersController(CustomerApplicationService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<CustomerResponse>>> GetAll(
        CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId))
            return Unauthorized();

        return Ok(await service.GetAllAsync(salonId, cancellationToken));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<CustomerResponse>> GetById(
        string id,
        CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId))
            return Unauthorized();

        var customer = await service.GetByIdAsync(salonId, id, cancellationToken);
        return customer is null ? NotFound() : Ok(customer);
    }

    [HttpPatch("{id}/profile")]
    public async Task<ActionResult<CustomerMutationResponse>> UpdateProfile(
        string id,
        [FromBody] CustomerProfileUpdateRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId))
            return Unauthorized();

        var result = await service.UpdateProfileAsync(
            salonId,
            id,
            request,
            cancellationToken);

        if (result.Success)
            return Ok(result);

        return string.Equals(result.Message, "Customer not found.", StringComparison.Ordinal)
            ? NotFound(result)
            : BadRequest(result);
    }

    [HttpPatch("{id}/notes")]
    public async Task<ActionResult<CustomerMutationResponse>> UpdateNotes(
        string id,
        [FromBody] CustomerNotesRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetSalonId(out var salonId))
            return Unauthorized();

        var result = await service.UpdateNotesAsync(
            salonId,
            id,
            request.Notes,
            cancellationToken);

        if (result.Success)
            return Ok(result);

        return string.Equals(result.Message, "Customer not found.", StringComparison.Ordinal)
            ? NotFound(result)
            : BadRequest(result);
    }

    private bool TryGetSalonId(out Guid salonId)
        => Guid.TryParse(User.FindFirstValue("salon_id"), out salonId);
}
