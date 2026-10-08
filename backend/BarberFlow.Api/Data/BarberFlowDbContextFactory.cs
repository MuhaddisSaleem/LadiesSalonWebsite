using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace BarberFlow.Api.Data;

public sealed class BarberFlowDbContextFactory : IDesignTimeDbContextFactory<BarberFlowDbContext>
{
    public BarberFlowDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("BARBERFLOW_DB_CONNECTION")
            ?? "Server=localhost,1433;Database=BarberFlow;User Id=sa;Password=DesignTimeOnly123!;Encrypt=False;TrustServerCertificate=True";

        var options = new DbContextOptionsBuilder<BarberFlowDbContext>()
            .UseSqlServer(connectionString)
            .Options;

        return new BarberFlowDbContext(options);
    }
}
