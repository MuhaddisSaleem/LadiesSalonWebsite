using BarberFlow.Api.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarberFlow.Api.Data.Migrations;

[DbContext(typeof(BarberFlowDbContext))]
[Migration("20261005121500_AddAccountVerificationCodes")]
public partial class AddAccountVerificationCodes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "AccountVerificationCodes",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                SalonUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Purpose = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                DestinationEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                CodeHash = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                ExpiresAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                AttemptCount = table.Column<int>(type: "int", nullable: false),
                IsUsed = table.Column<bool>(type: "bit", nullable: false),
                CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_AccountVerificationCodes", x => x.Id);
                table.ForeignKey(
                    name: "FK_AccountVerificationCodes_SalonUsers_SalonUserId",
                    column: x => x.SalonUserId,
                    principalTable: "SalonUsers",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_AccountVerificationCodes_ExpiresAtUtc",
            table: "AccountVerificationCodes",
            column: "ExpiresAtUtc");

        migrationBuilder.CreateIndex(
            name: "IX_AccountVerificationCodes_SalonUserId_Purpose_CreatedAtUtc",
            table: "AccountVerificationCodes",
            columns: new[] { "SalonUserId", "Purpose", "CreatedAtUtc" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "AccountVerificationCodes");
    }
}
