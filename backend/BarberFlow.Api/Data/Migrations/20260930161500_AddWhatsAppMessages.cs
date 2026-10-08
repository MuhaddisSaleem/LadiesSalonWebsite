using BarberFlow.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarberFlow.Api.Data.Migrations;

[DbContext(typeof(BarberFlowDbContext))]
[Migration("20260930161500_AddWhatsAppMessages")]
public partial class AddWhatsAppMessages : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "WhatsAppMessages",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                SalonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                BookingId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                MessageType = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                RecipientPhone = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                TemplateName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                TemplateLanguage = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                Status = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                ProviderMessageId = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                FailureReason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                SentAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_WhatsAppMessages", x => x.Id);
                table.ForeignKey(
                    name: "FK_WhatsAppMessages_Bookings_BookingId",
                    column: x => x.BookingId,
                    principalTable: "Bookings",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_WhatsAppMessages_Salons_SalonId",
                    column: x => x.SalonId,
                    principalTable: "Salons",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_WhatsAppMessages_BookingId_MessageType",
            table: "WhatsAppMessages",
            columns: new[] { "BookingId", "MessageType" },
            unique: true,
            filter: "[MessageType] = 'BookingConfirmation'");

        migrationBuilder.CreateIndex(
            name: "IX_WhatsAppMessages_SalonId_CreatedAtUtc",
            table: "WhatsAppMessages",
            columns: new[] { "SalonId", "CreatedAtUtc" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "WhatsAppMessages");
    }
}
