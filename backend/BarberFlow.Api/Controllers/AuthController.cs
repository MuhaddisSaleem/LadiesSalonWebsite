using BarberFlow.Api.Contracts.Auth;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BarberFlow.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(AuthApplicationService auth) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await auth.LoginAsync(request, cancellationToken);
        return result.Success ? Ok(result) : Unauthorized(result);
    }


    [Authorize]
    [HttpPatch("password")]
    public async Task<ActionResult<AuthMutationResponse>> ChangePassword(
        [FromBody] ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var result = await auth.ChangePasswordAsync(User, request, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [Authorize]
    [HttpPost("email-change/request")]
    public async Task<ActionResult<AuthMutationResponse>> RequestEmailChange(
        [FromBody] RequestEmailChangeRequest request,
        CancellationToken cancellationToken)
    {
        var result = await auth.RequestEmailChangeAsync(User, request, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [Authorize]
    [HttpPost("email-change/confirm")]
    public async Task<ActionResult<AuthMutationResponse>> ConfirmEmailChange(
        [FromBody] ConfirmEmailChangeRequest request,
        CancellationToken cancellationToken)
    {
        var result = await auth.ConfirmEmailChangeAsync(User, request, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [AllowAnonymous]
    [HttpPost("password-reset/request")]
    public async Task<ActionResult<AuthMutationResponse>> RequestPasswordReset(
        [FromBody] PasswordResetRequest request,
        CancellationToken cancellationToken)
    {
        var result = await auth.RequestPasswordResetAsync(request, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [AllowAnonymous]
    [HttpPost("password-reset/confirm")]
    public async Task<ActionResult<AuthMutationResponse>> ConfirmPasswordReset(
        [FromBody] ConfirmPasswordResetRequest request,
        CancellationToken cancellationToken)
    {
        var result = await auth.ConfirmPasswordResetAsync(request, cancellationToken);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<AuthUserDto>> Me(CancellationToken cancellationToken)
    {
        var user = await auth.GetCurrentUserAsync(User, cancellationToken);
        return user is null ? Unauthorized() : Ok(user);
    }
}
