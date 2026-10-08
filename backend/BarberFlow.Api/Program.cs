using BarberFlow.Api.Data;
using System.Text;
using System.Security.Claims;
using System.Security.Cryptography;
using BarberFlow.Api.Domain.Entities;
using BarberFlow.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services.AddScoped<BookingApplicationService>();
builder.Services.AddScoped<CustomerApplicationService>();
builder.Services.AddScoped<DashboardApplicationService>();
builder.Services.AddScoped<ReportsApplicationService>();
builder.Services.AddScoped<NotificationApplicationService>();
builder.Services.AddScoped<WhatsAppMessagingService>();
builder.Services.AddHttpClient<WhatsAppCloudApiClient>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});
builder.Services.AddScoped<CatalogApplicationService>();
builder.Services.AddScoped<AuthApplicationService>();
builder.Services.AddScoped<AccountEmailService>();
builder.Services.AddScoped<IPasswordHasher<SalonUser>, PasswordHasher<SalonUser>>();

var jwtSigningKey = builder.Configuration["Jwt:SigningKey"];
if (string.IsNullOrWhiteSpace(jwtSigningKey) || jwtSigningKey.Length < 32)
{
    throw new InvalidOperationException(
        "Jwt:SigningKey is required and must contain at least 32 characters.");
}

var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "BarberFlow.Api";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "BarberFlow.Admin";

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var principal = context.Principal;
                if (!Guid.TryParse(principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
                {
                    context.Fail("Invalid session.");
                    return;
                }
                var db = context.HttpContext.RequestServices.GetRequiredService<BarberFlowDbContext>();
                var user = await db.SalonUsers.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == userId, context.HttpContext.RequestAborted);
                var stamp = principal?.FindFirstValue(SessionStamp.Claim) ?? "";
                if (user is null || !user.IsActive || !CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(stamp),
                    Encoding.UTF8.GetBytes(SessionStamp.Create(user, jwtSigningKey))))
                    context.Fail("Session expired. Sign in again.");
            }
        };
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

builder.Services.AddAuthorization();

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "ConnectionStrings:DefaultConnection is required. " +
        "Set it in user secrets, appsettings.Development.json, Docker Compose, or an environment variable.");
}

builder.Services.AddDbContext<BarberFlowDbContext>(options =>
    options.UseSqlServer(
        connectionString,
        sql => sql.EnableRetryOnFailure(maxRetryCount: 5)));

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>()
    ?? ["http://localhost:4200"];

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<BarberFlowDbContext>();
    await db.Database.MigrateAsync();

    if (builder.Configuration.GetValue<bool>("SeedData:Enabled"))
    {
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<SalonUser>>();
        await DevelopmentDataSeeder.SeedAsync(db, builder.Configuration, passwordHasher);
    }
}

app.UseResponseCompression();
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("Frontend");
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

app.Run();

public partial class Program { }
