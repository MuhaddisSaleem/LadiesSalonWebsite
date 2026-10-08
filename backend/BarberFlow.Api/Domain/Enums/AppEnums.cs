namespace BarberFlow.Api.Domain.Enums;

public enum BookingStatus
{
    Pending = 1,
    Confirmed = 2,
    Completed = 3,
    Cancelled = 4
}

public enum BookingSource
{
    Online = 1,
    Admin = 2,
    WalkIn = 3
}

public enum ServiceLocation
{
    Salon = 1,
    Home = 2
}

public enum SalonUserRole
{
    Owner = 1,
    Manager = 2,
    Receptionist = 3,
    Barber = 4
}
