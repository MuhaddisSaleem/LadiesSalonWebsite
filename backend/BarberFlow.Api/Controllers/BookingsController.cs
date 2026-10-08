using BarberFlow.Api.Contracts.Bookings;
using BarberFlow.Api.Domain.Enums;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/bookings")]
public sealed class BookingsController(BookingApplicationService service) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BookingResponse>>> GetAll(CancellationToken cancellationToken)
        => Ok(await service.GetAllAsync(cancellationToken));

    [AllowAnonymous]
    [HttpGet("busy-slots")]
    public async Task<ActionResult<IReadOnlyList<BookingBusySlotResponse>>> GetBusySlots(
        CancellationToken cancellationToken)
        => Ok(await service.GetBusySlotsAsync(cancellationToken));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BookingResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var booking = await service.GetByPublicIdAsync(id, cancellationToken);
        return booking is null ? NotFound() : Ok(booking);
    }

    [AllowAnonymous]
    [HttpPost("online")]
    public async Task<ActionResult<BookingMutationResponse>> CreateOnline(
        [FromBody] IReadOnlyList<BookingRequest> requests,
        CancellationToken cancellationToken)
        => ToActionResult(await service.CreateManyAsync(requests, BookingSource.Online, cancellationToken));

    [HttpPost("walk-in")]
    public async Task<ActionResult<BookingMutationResponse>> CreateWalkIn(
        [FromBody] BookingRequest request,
        CancellationToken cancellationToken)
        => ToActionResult(await service.CreateAsync(request, BookingSource.WalkIn, cancellationToken));

    [HttpPost("admin")]
    public async Task<ActionResult<BookingMutationResponse>> CreateAdmin(
        [FromBody] BookingRequest request,
        CancellationToken cancellationToken)
        => ToActionResult(await service.CreateAsync(request, BookingSource.Admin, cancellationToken));

    [AllowAnonymous]
    [HttpPost("availability")]
    public async Task<ActionResult<AvailabilityResponse>> Availability(
        [FromBody] AvailabilityRequest request,
        CancellationToken cancellationToken)
        => Ok(await service.CheckAvailabilityAsync(request, cancellationToken));

    [HttpPatch("{id:int}/status")]
    public async Task<ActionResult<BookingMutationResponse>> UpdateStatus(
        int id,
        [FromBody] StatusUpdateRequest request,
        CancellationToken cancellationToken)
        => ToActionResult(await service.UpdateStatusAsync(id, request.Status, cancellationToken));

    [HttpPatch("{id:int}/barber")]
    public async Task<ActionResult<BookingMutationResponse>> AssignBarber(
        int id,
        [FromBody] BarberUpdateRequest request,
        CancellationToken cancellationToken)
        => ToActionResult(await service.AssignBarberAsync(id, request.Barber, cancellationToken));

    [HttpPatch("{id:int}/schedule")]
    public async Task<ActionResult<BookingMutationResponse>> Reschedule(
        int id,
        [FromBody] ScheduleUpdateRequest request,
        CancellationToken cancellationToken)
        => ToActionResult(await service.RescheduleAsync(id, request, cancellationToken));

    [HttpPatch("{id:int}/special-service-price")]
    public async Task<ActionResult<BookingMutationResponse>> UpdateSpecialPrice(
        int id,
        [FromBody] SpecialServicePriceRequest request,
        CancellationToken cancellationToken)
        => ToActionResult(await service.UpdateSpecialServiceAmountAsync(id, request.Amount, cancellationToken));

    [HttpDelete("{id:int}")]
    public async Task<ActionResult<BookingMutationResponse>> Cancel(int id, CancellationToken cancellationToken)
        => ToActionResult(await service.UpdateStatusAsync(id, "Cancelled", cancellationToken));

    private ActionResult<BookingMutationResponse> ToActionResult(BookingMutationResponse result)
        => result.Success ? Ok(result) : Conflict(result);
}
