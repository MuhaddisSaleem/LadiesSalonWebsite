using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarberFlow.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCatalogApiPersistence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "ImageUrl",
                table: "Barbers",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(1000)",
                oldMaxLength: 1000,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ImageUrl",
                table: "Services",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(1000)",
                oldMaxLength: 1000,
                oldNullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PublicId",
                table: "Services",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "BrandSubtitle",
                table: "SalonSettings",
                type: "nvarchar(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "LOOK GOOD · FEEL GREAT");

            migrationBuilder.AddColumn<string>(
                name: "HeroEyebrow",
                table: "SalonSettings",
                type: "nvarchar(60)",
                maxLength: 60,
                nullable: false,
                defaultValue: "PREMIUM BARBERSHOP");

            migrationBuilder.AddColumn<string>(
                name: "HeroHeadline",
                table: "SalonSettings",
                type: "nvarchar(90)",
                maxLength: 90,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "HeroTagline",
                table: "SalonSettings",
                type: "nvarchar(140)",
                maxLength: 140,
                nullable: false,
                defaultValue: "More Than a Haircut. It's a Lifestyle.");

            migrationBuilder.AddColumn<bool>(
                name: "NotifyOwnerOnNewBooking",
                table: "SalonSettings",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "ReminderHoursBefore",
                table: "SalonSettings",
                type: "int",
                nullable: false,
                defaultValue: 2);

            migrationBuilder.AddColumn<bool>(
                name: "SendAppointmentReminder",
                table: "SalonSettings",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "SendSmsFallback",
                table: "SalonSettings",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "SendWhatsappConfirmation",
                table: "SalonSettings",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "Salons",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                table: "Salons",
                type: "nvarchar(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WhatsAppNumber",
                table: "Salons",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PublicId",
                table: "Barbers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "LeaveType",
                table: "BarberLeaves",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "On Leave");

            migrationBuilder.Sql(@"
                ;WITH RankedServices AS (
                    SELECT Id, ROW_NUMBER() OVER (PARTITION BY SalonId ORDER BY CreatedAtUtc, Id) AS PublicId
                    FROM Services
                )
                UPDATE s
                SET PublicId = r.PublicId
                FROM Services s
                INNER JOIN RankedServices r ON r.Id = s.Id;

                ;WITH RankedBarbers AS (
                    SELECT Id, ROW_NUMBER() OVER (PARTITION BY SalonId ORDER BY CreatedAtUtc, Id) AS PublicId
                    FROM Barbers
                )
                UPDATE b
                SET PublicId = r.PublicId
                FROM Barbers b
                INNER JOIN RankedBarbers r ON r.Id = b.Id;

                UPDATE Salons
                SET WhatsAppNumber = Phone
                WHERE WhatsAppNumber IS NULL AND Phone IS NOT NULL;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_Services_SalonId_PublicId",
                table: "Services",
                columns: new[] { "SalonId", "PublicId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Barbers_SalonId_PublicId",
                table: "Barbers",
                columns: new[] { "SalonId", "PublicId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "ImageUrl",
                table: "Barbers",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.DropIndex(
                name: "IX_Services_SalonId_PublicId",
                table: "Services");

            migrationBuilder.DropIndex(
                name: "IX_Barbers_SalonId_PublicId",
                table: "Barbers");

            migrationBuilder.DropColumn(
                name: "PublicId",
                table: "Services");

            migrationBuilder.DropColumn(
                name: "BrandSubtitle",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "HeroEyebrow",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "HeroHeadline",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "HeroTagline",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "NotifyOwnerOnNewBooking",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "ReminderHoursBefore",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "SendAppointmentReminder",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "SendSmsFallback",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "SendWhatsappConfirmation",
                table: "SalonSettings");

            migrationBuilder.DropColumn(
                name: "Address",
                table: "Salons");

            migrationBuilder.DropColumn(
                name: "City",
                table: "Salons");

            migrationBuilder.DropColumn(
                name: "WhatsAppNumber",
                table: "Salons");

            migrationBuilder.DropColumn(
                name: "PublicId",
                table: "Barbers");

            migrationBuilder.DropColumn(
                name: "LeaveType",
                table: "BarberLeaves");

            migrationBuilder.AlterColumn<string>(
                name: "ImageUrl",
                table: "Services",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);
        }
    }
}
