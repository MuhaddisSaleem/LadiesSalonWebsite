using BarberFlow.Api.Domain.Common;

namespace BarberFlow.Api.Domain.Entities;

public sealed class Salon : BaseEntity
{
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public string? Phone { get; set; }
    public string? WhatsAppNumber { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public string TimeZone { get; set; } = "Asia/Karachi";
    public string CurrencyCode { get; set; } = "PKR";
    public bool IsActive { get; set; } = true;

    public SalonSettings? Settings { get; set; }
    public ICollection<SalonUser> Users { get; set; } = [];
    public ICollection<Barber> Barbers { get; set; } = [];
    public ICollection<ServiceCategory> ServiceCategories { get; set; } = [];
    public ICollection<Service> Services { get; set; } = [];
    public ICollection<Customer> Customers { get; set; } = [];
    public ICollection<Booking> Bookings { get; set; } = [];
    public ICollection<SalonNotification> Notifications { get; set; } = [];
    public ICollection<WhatsAppMessage> WhatsAppMessages { get; set; } = [];
    public ICollection<BusinessHour> BusinessHours { get; set; } = [];
}

public sealed class SalonSettings : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;

    public int BookingIntervalMinutes { get; set; } = 30;
    public int MaxAdvanceDays { get; set; } = 30;
    public bool AllowSameDayBooking { get; set; } = true;
    public bool AutoConfirmBookings { get; set; } = true;
    public int CancellationHours { get; set; } = 2;
    public int LateArrivalMinutes { get; set; } = 10;

    public string BrandSubtitle { get; set; } = "LOOK GOOD · FEEL GREAT";
    public string HeroEyebrow { get; set; } = "PREMIUM BARBERSHOP";
    public string HeroHeadline { get; set; } = "";
    public string HeroTagline { get; set; } = "More Than a Haircut. It's a Lifestyle.";

    public bool SendWhatsappConfirmation { get; set; }
    public bool SendSmsFallback { get; set; }
    public bool SendAppointmentReminder { get; set; }
    public int ReminderHoursBefore { get; set; } = 2;
    public bool NotifyOwnerOnNewBooking { get; set; } = true;
}

public sealed class BusinessHour : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;

    public DayOfWeek DayOfWeek { get; set; }
    public bool IsOpen { get; set; } = true;
    public TimeOnly? OpenTime { get; set; }
    public TimeOnly? CloseTime { get; set; }
}
