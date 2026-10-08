namespace BarberFlow.Api.Domain.Entities;

public sealed class BrandingAsset
{
    public Guid SalonId { get; set; }
    public required string Key { get; set; }
    public required string ContentType { get; set; }
    public required byte[] Data { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
}
