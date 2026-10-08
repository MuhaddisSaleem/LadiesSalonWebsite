using System.Security.Claims;
using BarberFlow.Api.Data;
using BarberFlow.Api.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Controllers;

[ApiController, Route("api/branding"), Authorize]
public sealed class BrandingController(BarberFlowDbContext db) : ControllerBase
{
    private const int MaxSize = 2 * 1024 * 1024;
    private Task<Guid> PublicSalon(CancellationToken ct) => db.Salons
        .Where(x => x.Slug == "royal-barbers" && x.IsActive).Select(x => x.Id).FirstOrDefaultAsync(ct);

    [HttpGet, AllowAnonymous]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var salonId = await PublicSalon(ct);
        var assets = await db.BrandingAssets.AsNoTracking().Where(x => x.SalonId == salonId)
            .Select(x => new { x.Key, x.ContentType, x.Version }).ToListAsync(ct);
        Response.Headers.CacheControl = "no-store";
        return Ok(assets.Select(x => new { x.Key, x.ContentType, Url = $"/api/branding/{x.Key}?v={x.Version}" }));
    }

    [HttpGet("{key}"), AllowAnonymous]
    public async Task<IActionResult> Get(string key, CancellationToken ct)
    {
        var salonId = await PublicSalon(ct);
        var asset = await db.BrandingAssets.AsNoTracking().FirstOrDefaultAsync(x => x.SalonId == salonId && x.Key == key, ct);
        if (asset is null) return NotFound();
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(asset.Data, asset.ContentType, enableRangeProcessing: true);
    }

    [HttpPut("{key}"), RequestSizeLimit(MaxSize + 65536)]
    public async Task<IActionResult> Put(string key, IFormFile file, CancellationToken ct)
    {
        if (key is not ("logo" or "hero")) return BadRequest("Invalid media slot.");
        if (!Guid.TryParse(User.FindFirstValue("salon_id"), out var salonId)
            || salonId != await PublicSalon(ct)) return Forbid();
        if (file.Length is <= 0 or > MaxSize) return BadRequest("Media must be 2 MB or smaller.");
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, ct);
        var data = stream.ToArray();
        var contentType = DetectContentType(data);
        if (contentType is null || (key == "logo" && !contentType.StartsWith("image/")))
            return BadRequest("Use PNG, JPEG, GIF, WebP, or a hero MP4/WebM video.");
        var asset = await db.BrandingAssets.FindAsync([salonId, key], ct);
        if (asset is null)
        {
            asset = new BrandingAsset { SalonId = salonId, Key = key, ContentType = contentType, Data = data };
            db.BrandingAssets.Add(asset);
        }
        asset.Data = data;
        asset.ContentType = contentType;
        asset.Version = Guid.NewGuid();
        await db.SaveChangesAsync(ct);
        return Ok(new { asset.Key, asset.ContentType, Url = $"/api/branding/{key}?v={asset.Version}" });
    }

    [HttpDelete("{key}")]
    public async Task<IActionResult> Delete(string key, CancellationToken ct)
    {
        if (key is not ("logo" or "hero")) return BadRequest();
        if (!Guid.TryParse(User.FindFirstValue("salon_id"), out var salonId)
            || salonId != await PublicSalon(ct)) return Forbid();
        await db.BrandingAssets.Where(x => x.SalonId == salonId && x.Key == key).ExecuteDeleteAsync(ct);
        return NoContent();
    }

    internal static string? DetectContentType(byte[] bytes)
    {
        ReadOnlySpan<byte> data = bytes;
        if (data.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
        if (data.StartsWith(new byte[] { 255, 216, 255 })) return "image/jpeg";
        if (data.StartsWith("GIF87a"u8) || data.StartsWith("GIF89a"u8)) return "image/gif";
        if (data.Length >= 12 && data.StartsWith("RIFF"u8) && data.Slice(8, 4).SequenceEqual("WEBP"u8)) return "image/webp";
        if (data.Length >= 12 && data.Slice(4, 4).SequenceEqual("ftyp"u8)) return "video/mp4";
        if (data.StartsWith(new byte[] { 26, 69, 223, 163 })) return "video/webm";
        return null;
    }
}
