using BarberFlow.Api.Domain.Common;
using BarberFlow.Api.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Api.Data;

public sealed class BarberFlowDbContext(DbContextOptions<BarberFlowDbContext> options)
    : DbContext(options)
{
    public DbSet<BrandingAsset> BrandingAssets => Set<BrandingAsset>();
    public DbSet<Salon> Salons => Set<Salon>();
    public DbSet<SalonSettings> SalonSettings => Set<SalonSettings>();
    public DbSet<SalonUser> SalonUsers => Set<SalonUser>();
    public DbSet<AccountVerificationCode> AccountVerificationCodes => Set<AccountVerificationCode>();
    public DbSet<BusinessHour> BusinessHours => Set<BusinessHour>();
    public DbSet<Barber> Barbers => Set<Barber>();
    public DbSet<BarberService> BarberServices => Set<BarberService>();
    public DbSet<BarberWorkingHour> BarberWorkingHours => Set<BarberWorkingHour>();
    public DbSet<BarberScheduleOverride> BarberScheduleOverrides => Set<BarberScheduleOverride>();
    public DbSet<BarberLeave> BarberLeaves => Set<BarberLeave>();
    public DbSet<ServiceCategory> ServiceCategories => Set<ServiceCategory>();
    public DbSet<Service> Services => Set<Service>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingService> BookingServices => Set<BookingService>();
    public DbSet<SalonNotification> Notifications => Set<SalonNotification>();
    public DbSet<WhatsAppMessage> WhatsAppMessages => Set<WhatsAppMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<BrandingAsset>(entity =>
        {
            entity.ToTable("BrandingAssets");
            entity.HasKey(x => new { x.SalonId, x.Key });
            entity.Property(x => x.Key).HasMaxLength(10);
            entity.Property(x => x.ContentType).HasMaxLength(50);
            entity.Property(x => x.Data).IsRequired();
            entity.HasOne<Salon>().WithMany().HasForeignKey(x => x.SalonId).OnDelete(DeleteBehavior.Cascade);
        });
        ConfigureSalon(modelBuilder);
        ConfigureSalonUser(modelBuilder);
        ConfigureAccountVerificationCode(modelBuilder);
        ConfigureServiceCategory(modelBuilder);
        ConfigureService(modelBuilder);
        ConfigureBarber(modelBuilder);
        ConfigureCustomer(modelBuilder);
        ConfigureBooking(modelBuilder);
        ConfigureNotification(modelBuilder);
        ConfigureWhatsAppMessage(modelBuilder);
    }

    private static void ConfigureSalon(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Salon>(entity =>
        {
            entity.ToTable("Salons");
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Slug).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Phone).HasMaxLength(30);
            entity.Property(x => x.WhatsAppNumber).HasMaxLength(30);
            entity.Property(x => x.Email).HasMaxLength(254);
            entity.Property(x => x.Address).HasMaxLength(500);
            entity.Property(x => x.City).HasMaxLength(120);
            entity.Property(x => x.TimeZone).HasMaxLength(80).IsRequired();
            entity.Property(x => x.CurrencyCode).HasMaxLength(3).IsRequired();
            entity.HasIndex(x => x.Slug).IsUnique();
        });

        modelBuilder.Entity<SalonSettings>(entity =>
        {
            entity.ToTable("SalonSettings");
            entity.Property(x => x.BrandSubtitle).HasMaxLength(60);
            entity.Property(x => x.HeroEyebrow).HasMaxLength(60);
            entity.Property(x => x.HeroHeadline).HasMaxLength(90);
            entity.Property(x => x.HeroTagline).HasMaxLength(140);
            entity.HasIndex(x => x.SalonId).IsUnique();
            entity.HasOne(x => x.Salon)
                .WithOne(x => x.Settings)
                .HasForeignKey<SalonSettings>(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BusinessHour>(entity =>
        {
            entity.ToTable("BusinessHours");
            entity.Property(x => x.OpenTime).HasColumnType("time");
            entity.Property(x => x.CloseTime).HasColumnType("time");
            entity.HasIndex(x => new { x.SalonId, x.DayOfWeek }).IsUnique();
            entity.HasOne(x => x.Salon)
                .WithMany(x => x.BusinessHours)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureSalonUser(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SalonUser>(entity =>
        {
            entity.ToTable("SalonUsers");
            entity.Property(x => x.FullName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Email).HasMaxLength(254).IsRequired();
            entity.Property(x => x.PasswordHash).HasMaxLength(500);
            entity.HasIndex(x => new { x.SalonId, x.Email }).IsUnique();
            entity.HasOne(x => x.Salon)
                .WithMany(x => x.Users)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }


    private static void ConfigureAccountVerificationCode(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AccountVerificationCode>(entity =>
        {
            entity.ToTable("AccountVerificationCodes");
            entity.Property(x => x.Purpose).HasMaxLength(40).IsRequired();
            entity.Property(x => x.DestinationEmail).HasMaxLength(254).IsRequired();
            entity.Property(x => x.CodeHash).HasMaxLength(128).IsRequired();
            entity.HasIndex(x => new { x.SalonUserId, x.Purpose, x.CreatedAtUtc });
            entity.HasIndex(x => x.ExpiresAtUtc);
            entity.HasOne(x => x.SalonUser)
                .WithMany()
                .HasForeignKey(x => x.SalonUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureServiceCategory(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ServiceCategory>(entity =>
        {
            entity.ToTable("ServiceCategories");
            entity.Property(x => x.Name).HasMaxLength(120).IsRequired();
            entity.HasIndex(x => new { x.SalonId, x.PublicId }).IsUnique();
            entity.HasIndex(x => new { x.SalonId, x.Name }).IsUnique();
            entity.HasIndex(x => new { x.SalonId, x.IsActive, x.SortOrder });
            entity.HasOne(x => x.Salon)
                .WithMany(x => x.ServiceCategories)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureService(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Service>(entity =>
        {
            entity.ToTable("Services");
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.OriginalPrice).HasPrecision(18, 2);
            entity.Property(x => x.DiscountPrice).HasPrecision(18, 2);
            entity.Property(x => x.HomeOriginalPrice).HasPrecision(18, 2);
            entity.Property(x => x.HomeDiscountPrice).HasPrecision(18, 2);
            entity.Property(x => x.ImageUrl).HasColumnType("nvarchar(max)");
            entity.HasIndex(x => new { x.SalonId, x.PublicId }).IsUnique();
            entity.HasIndex(x => new { x.SalonId, x.Name }).IsUnique();
            entity.HasIndex(x => x.ServiceCategoryId);
            entity.HasOne(x => x.ServiceCategory)
                .WithMany(x => x.Services)
                .HasForeignKey(x => x.ServiceCategoryId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Salon)
                .WithMany(x => x.Services)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureBarber(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Barber>(entity =>
        {
            entity.ToTable("Barbers");
            entity.Property(x => x.FullName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Phone).HasMaxLength(30);
            entity.Property(x => x.ImageUrl).HasColumnType("nvarchar(max)");
            entity.Property(x => x.Rating).HasPrecision(3, 2);
            entity.HasIndex(x => new { x.SalonId, x.PublicId }).IsUnique();
            entity.HasIndex(x => new { x.SalonId, x.IsActive });
            entity.HasOne(x => x.Salon)
                .WithMany(x => x.Barbers)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BarberService>(entity =>
        {
            entity.ToTable("BarberServices");
            entity.HasKey(x => new { x.BarberId, x.ServiceId });
            entity.HasOne(x => x.Barber)
                .WithMany(x => x.Services)
                .HasForeignKey(x => x.BarberId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Service)
                .WithMany(x => x.Barbers)
                .HasForeignKey(x => x.ServiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BarberWorkingHour>(entity =>
        {
            entity.ToTable("BarberWorkingHours");
            entity.Property(x => x.StartTime).HasColumnType("time");
            entity.Property(x => x.EndTime).HasColumnType("time");
            entity.HasIndex(x => new { x.BarberId, x.DayOfWeek }).IsUnique();
            entity.HasOne(x => x.Barber)
                .WithMany(x => x.WorkingHours)
                .HasForeignKey(x => x.BarberId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BarberScheduleOverride>(entity =>
        {
            entity.ToTable("BarberScheduleOverrides");
            entity.Property(x => x.Date).HasColumnType("date");
            entity.Property(x => x.Reason).HasMaxLength(500);
            entity.HasIndex(x => new { x.BarberId, x.Date }).IsUnique();
            entity.HasOne(x => x.Barber)
                .WithMany(x => x.ScheduleOverrides)
                .HasForeignKey(x => x.BarberId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BarberLeave>(entity =>
        {
            entity.ToTable("BarberLeaves");
            entity.Property(x => x.StartDate).HasColumnType("date");
            entity.Property(x => x.EndDate).HasColumnType("date");
            entity.Property(x => x.LeaveType).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Reason).HasMaxLength(500);
            entity.HasIndex(x => new { x.BarberId, x.StartDate, x.EndDate });
            entity.HasOne(x => x.Barber)
                .WithMany(x => x.Leaves)
                .HasForeignKey(x => x.BarberId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureCustomer(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Customer>(entity =>
        {
            entity.ToTable("Customers");
            entity.Property(x => x.FullName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Phone).HasMaxLength(30);
            entity.Property(x => x.Email).HasMaxLength(254);
            entity.Property(x => x.Notes).HasMaxLength(2000);
            entity.HasIndex(x => new { x.SalonId, x.Phone });
            entity.HasOne(x => x.Salon)
                .WithMany(x => x.Customers)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureNotification(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SalonNotification>(entity =>
        {
            entity.ToTable("Notifications");
            entity.Property(x => x.Type).HasMaxLength(32).IsRequired();
            entity.Property(x => x.Title).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Message).HasMaxLength(1000).IsRequired();
            entity.Property(x => x.Icon).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Url).HasMaxLength(500);
            entity.HasIndex(x => new { x.SalonId, x.CreatedAtUtc });
            entity.HasIndex(x => new { x.SalonId, x.IsRead, x.CreatedAtUtc });
            entity.HasOne(x => x.Salon)
                .WithMany(x => x.Notifications)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureWhatsAppMessage(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WhatsAppMessage>(entity =>
        {
            entity.ToTable("WhatsAppMessages");
            entity.Property(x => x.MessageType).HasMaxLength(60).IsRequired();
            entity.Property(x => x.RecipientPhone).HasMaxLength(30).IsRequired();
            entity.Property(x => x.TemplateName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.TemplateLanguage).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Status).HasMaxLength(30).IsRequired();
            entity.Property(x => x.ProviderMessageId).HasMaxLength(500);
            entity.Property(x => x.FailureReason).HasMaxLength(2000);
            entity.HasIndex(x => new { x.SalonId, x.CreatedAtUtc });
            entity.HasIndex(x => new { x.BookingId, x.MessageType })
                .IsUnique()
                .HasFilter("[MessageType] = 'BookingConfirmation'");
            entity.HasOne(x => x.Salon)
                .WithMany(x => x.WhatsAppMessages)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Booking)
                .WithMany(x => x.WhatsAppMessages)
                .HasForeignKey(x => x.BookingId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureBooking(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Booking>(entity =>
        {
            entity.ToTable("Bookings");
            entity.Property(x => x.BookingCode).HasMaxLength(40).IsRequired();
            entity.Property(x => x.CustomerName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.CustomerPhone).HasMaxLength(30);
            entity.Property(x => x.AppointmentDate).HasColumnType("date");
            entity.Property(x => x.StartTime).HasColumnType("time");
            entity.Property(x => x.TotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.Notes).HasMaxLength(2000);
            entity.Property(x => x.ServiceAddress).HasMaxLength(1000);
            entity.Property(x => x.SpecialService).HasMaxLength(1000);
            entity.Property(x => x.SpecialServiceAmount).HasPrecision(18, 2);

            entity.HasIndex(x => new { x.SalonId, x.PublicId }).IsUnique();
            entity.HasIndex(x => new { x.SalonId, x.BookingCode }).IsUnique();
            entity.HasIndex(x => new { x.SalonId, x.AppointmentDate, x.Status });
            entity.HasIndex(x => new { x.SalonId, x.BarberId, x.AppointmentDate, x.StartTime });

            entity.HasOne(x => x.Salon)
                .WithMany(x => x.Bookings)
                .HasForeignKey(x => x.SalonId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Customer)
                .WithMany(x => x.Bookings)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(x => x.Barber)
                .WithMany(x => x.Bookings)
                .HasForeignKey(x => x.BarberId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BookingService>(entity =>
        {
            entity.ToTable("BookingServices");
            entity.Property(x => x.ServiceName).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.BookingId, x.SortOrder });

            entity.HasOne(x => x.Booking)
                .WithMany(x => x.Services)
                .HasForeignKey(x => x.BookingId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Service)
                .WithMany(x => x.BookingServices)
                .HasForeignKey(x => x.ServiceId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    public override int SaveChanges()
    {
        TouchUpdatedEntities();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        TouchUpdatedEntities();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void TouchUpdatedEntities()
    {
        var now = DateTimeOffset.UtcNow;

        foreach (var entry in ChangeTracker.Entries()
                     .Where(entry => entry.Entity is BaseEntity
                                     && entry.State is EntityState.Added or EntityState.Modified))
        {
            var entity = (BaseEntity)entry.Entity;
            entity.UpdatedAtUtc = now;

            if (entry.State == EntityState.Added)
            {
                entity.CreatedAtUtc = now;
            }
        }
    }
}
