using BarberFlow.Api.Domain.Common;

namespace BarberFlow.Api.Domain.Entities;

public sealed class Barber : BaseEntity
{
    public Guid SalonId { get; set; }
    public Salon Salon { get; set; } = null!;

    public int PublicId { get; set; }
    public required string FullName { get; set; }
    public string? Phone { get; set; }
    public string? ImageUrl { get; set; }
    public decimal Rating { get; set; }
    public int? ExperienceYears { get; set; }
    public bool IsActive { get; set; } = true;

    // Soft-delete keeps historical booking relationships intact while removing
    // the barber from current admin/customer catalog results.
    public bool IsDeleted { get; set; }

    public ICollection<BarberService> Services { get; set; } = [];
    public ICollection<BarberWorkingHour> WorkingHours { get; set; } = [];
    public ICollection<BarberScheduleOverride> ScheduleOverrides { get; set; } = [];
    public ICollection<BarberLeave> Leaves { get; set; } = [];
    public ICollection<Booking> Bookings { get; set; } = [];
}

public sealed class BarberService
{
    public Guid BarberId { get; set; }
    public Barber Barber { get; set; } = null!;

    public Guid ServiceId { get; set; }
    public Service Service { get; set; } = null!;
}

public sealed class BarberWorkingHour : BaseEntity
{
    public Guid BarberId { get; set; }
    public Barber Barber { get; set; } = null!;

    public DayOfWeek DayOfWeek { get; set; }
    public bool IsWorking { get; set; } = true;
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
}

public sealed class BarberScheduleOverride : BaseEntity
{
    public Guid BarberId { get; set; }
    public Barber Barber { get; set; } = null!;

    public DateOnly Date { get; set; }
    public bool IsAvailable { get; set; }
    public string? Reason { get; set; }
}

public sealed class BarberLeave : BaseEntity
{
    public Guid BarberId { get; set; }
    public Barber Barber { get; set; } = null!;

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public string LeaveType { get; set; } = "On Leave";
    public string? Reason { get; set; }
}
