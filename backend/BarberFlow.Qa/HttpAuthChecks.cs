using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using BarberFlow.Api.Contracts.Auth;
using BarberFlow.Api.Controllers;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

internal static class HttpAuthChecks
{
    public static async Task RunAsync(Action<bool, string> check)
    {
        await using var factory = new QaFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        const string email = "http-qa@example.test";
        const string originalPassword = "Initial-QA-password-123!";
        const string changedPassword = "Changed-QA-password-456!";
        const string resetPassword = "Reset-QA-password-789!";
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarberFlowDbContext>();
            var user = new SalonUser { FullName = "HTTP QA", Email = email, Salon = new Salon { Name = "HTTP QA", Slug = "royal-barbers" } };
            user.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<SalonUser>>().HashPassword(user, originalPassword);
            db.SalonUsers.Add(user);
            await db.SaveChangesAsync();
        }
        async Task<string> Login(string password)
        {
            var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
            check(response.IsSuccessStatusCode, "TT-09 HTTP login succeeds");
            return (await response.Content.ReadFromJsonAsync<LoginResponse>())!.Token!;
        }
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Login(originalPassword));
        check((await client.GetAsync("/api/auth/me")).IsSuccessStatusCode, "TT-09 issued token authenticates through middleware");
        var failedChange = await client.PatchAsJsonAsync("/api/auth/password", new ChangePasswordRequest("incorrect-password", changedPassword));
        check(failedChange.StatusCode == HttpStatusCode.BadRequest, "TT-09 wrong current password rejected");
        check((await client.GetAsync("/api/auth/me")).IsSuccessStatusCode, "TT-09 failed password change preserves session");
        var change = await client.PatchAsJsonAsync("/api/auth/password", new ChangePasswordRequest(originalPassword, changedPassword));
        check(change.IsSuccessStatusCode, "TT-09 HTTP password change succeeds");
        check((await client.GetAsync("/api/auth/me")).StatusCode == HttpStatusCode.Unauthorized, "TT-09 old token rejected after password change");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Login(changedPassword));
        check((await client.GetAsync("/api/auth/me")).IsSuccessStatusCode, "TT-09 new login token accepted");

        // Seed a delivered verification code; no SMTP or external recipient is used.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarberFlowDbContext>();
            var user = await db.SalonUsers.SingleAsync();
            var auth = scope.ServiceProvider.GetRequiredService<AuthApplicationService>();
            var entry = new AccountVerificationCode { SalonUserId = user.Id, Purpose = "password-reset", DestinationEmail = email, CodeHash = "", ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(5) };
            entry.CodeHash = (string)typeof(AuthApplicationService).GetMethod("HashVerificationCode", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(auth, [entry.Id, "123456", user.PasswordHash])!;
            db.AccountVerificationCodes.Add(entry);
            await db.SaveChangesAsync();
        }
        var reset = await client.PostAsJsonAsync("/api/auth/password-reset/confirm", new ConfirmPasswordResetRequest(email, "123456", resetPassword));
        check(reset.IsSuccessStatusCode, "TT-09 HTTP password reset succeeds with delivered code");
        check((await client.GetAsync("/api/auth/me")).StatusCode == HttpStatusCode.Unauthorized, "TT-09 old token rejected after password reset");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await Login(resetPassword));
        check((await client.GetAsync("/api/auth/me")).IsSuccessStatusCode, "TT-09 reset password issues usable new token");
        check(!(await client.PostAsJsonAsync("/api/auth/password-reset/confirm", new ConfirmPasswordResetRequest(email, "123456", originalPassword))).IsSuccessStatusCode, "TT-09 reset code cannot be reused");
        check((await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, changedPassword))).StatusCode == HttpStatusCode.Unauthorized, "TT-09 previous password cannot sign in after reset");
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BarberFlowDbContext>();
            (await db.SalonUsers.SingleAsync()).IsActive = false;
            await db.SaveChangesAsync();
        }
        check((await client.GetAsync("/api/auth/me")).StatusCode == HttpStatusCode.Unauthorized, "TT-09 inactive account token rejected");
        client.DefaultRequestHeaders.Authorization = null;
        check((await client.GetAsync("/api/branding")).IsSuccessStatusCode, "TT-04 anonymous HTTP branding read allowed");
        check((await client.DeleteAsync("/api/branding/logo")).StatusCode == HttpStatusCode.Unauthorized, "TT-04 anonymous HTTP branding mutation rejected");
    }

    private sealed class QaFactory : WebApplicationFactory<AuthController>
    {
        private readonly string database = Guid.NewGuid().ToString();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("Jwt:SigningKey", "qa-only-signing-key-for-isolated-http-tests-123456789");
            builder.UseSetting("ConnectionStrings:DefaultConnection", "Server=unused;Database=unused;");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<DbContextOptions<BarberFlowDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<BarberFlowDbContext>>();
                services.AddDbContext<BarberFlowDbContext>(options => options.UseInMemoryDatabase(database));
            });
        }
    }
}
