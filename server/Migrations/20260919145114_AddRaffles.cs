using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SellWithEllie.Migrations
{
    /// <inheritdoc />
    public partial class AddRaffles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Raffles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PrizeDescription = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ImageUrl = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    SeatCount = table.Column<int>(type: "int", nullable: false),
                    SeatPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    WinningSeatId = table.Column<int>(type: "int", nullable: true),
                    DrawnAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedByUserId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Raffles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RaffleSeats",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    RaffleId = table.Column<int>(type: "int", nullable: false),
                    SeatNumber = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ReservedByUserId = table.Column<string>(type: "nvarchar(450)", nullable: true),
                    ReservedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    OrderId = table.Column<int>(type: "int", nullable: true),
                    PaidAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RaffleSeats", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RaffleSeats_AspNetUsers_ReservedByUserId",
                        column: x => x.ReservedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RaffleSeats_Orders_OrderId",
                        column: x => x.OrderId,
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RaffleSeats_Raffles_RaffleId",
                        column: x => x.RaffleId,
                        principalTable: "Raffles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Raffles_TenantId_Status",
                table: "Raffles",
                columns: new[] { "TenantId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Raffles_WinningSeatId",
                table: "Raffles",
                column: "WinningSeatId");

            migrationBuilder.CreateIndex(
                name: "IX_RaffleSeats_OrderId",
                table: "RaffleSeats",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_RaffleSeats_RaffleId_SeatNumber",
                table: "RaffleSeats",
                columns: new[] { "RaffleId", "SeatNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RaffleSeats_ReservedByUserId",
                table: "RaffleSeats",
                column: "ReservedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Raffles_RaffleSeats_WinningSeatId",
                table: "Raffles",
                column: "WinningSeatId",
                principalTable: "RaffleSeats",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Raffles_RaffleSeats_WinningSeatId",
                table: "Raffles");

            migrationBuilder.DropTable(
                name: "RaffleSeats");

            migrationBuilder.DropTable(
                name: "Raffles");
        }
    }
}
