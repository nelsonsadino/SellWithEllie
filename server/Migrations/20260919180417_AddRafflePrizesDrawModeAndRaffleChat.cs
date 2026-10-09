using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SellWithEllie.Migrations
{
    /// <inheritdoc />
    public partial class AddRafflePrizesDrawModeAndRaffleChat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ---- 1. Create the new RafflePrizes table first, so the
            // backfill below (step 3) has somewhere to copy the old singular
            // prize/winner data into before those columns are dropped.
            migrationBuilder.CreateTable(
                name: "RafflePrizes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    RaffleId = table.Column<int>(type: "int", nullable: false),
                    Rank = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WinningSeatId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RafflePrizes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RafflePrizes_RaffleSeats_WinningSeatId",
                        column: x => x.WinningSeatId,
                        principalTable: "RaffleSeats",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RafflePrizes_Raffles_RaffleId",
                        column: x => x.RaffleId,
                        principalTable: "Raffles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RafflePrizes_RaffleId_Rank",
                table: "RafflePrizes",
                columns: new[] { "RaffleId", "Rank" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RafflePrizes_WinningSeatId",
                table: "RafflePrizes",
                column: "WinningSeatId");

            // ---- 2. New Raffle/ChatMessage columns (order-independent
            // relative to the backfill - these don't touch data being moved).
            migrationBuilder.AddColumn<int>(
                name: "DrawMode",
                table: "Raffles",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "ScheduledDrawAtUtc",
                table: "Raffles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "AuctionId",
                table: "ChatMessages",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<int>(
                name: "RaffleId",
                table: "ChatMessages",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChatMessages_RaffleId_SentAtUtc",
                table: "ChatMessages",
                columns: new[] { "RaffleId", "SentAtUtc" });

            migrationBuilder.AddForeignKey(
                name: "FK_ChatMessages_Raffles_RaffleId",
                table: "ChatMessages",
                column: "RaffleId",
                principalTable: "Raffles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            // ---- 3. Backfill: one rank-1 RafflePrize per existing Raffle,
            // carrying its PrizeDescription text and (if already drawn) its
            // WinningSeatId across before those source columns are dropped.
            // For a not-yet-drawn raffle WinningSeatId is already NULL, so
            // the copied RafflePrize.WinningSeatId is NULL too - correct,
            // nothing won yet.
            migrationBuilder.Sql(@"
                INSERT INTO RafflePrizes (TenantId, RaffleId, Rank, Description, WinningSeatId)
                SELECT TenantId, Id, 1, PrizeDescription, WinningSeatId
                FROM Raffles;
            ");

            // ---- 4. Now safe to drop the old singular columns.
            migrationBuilder.DropForeignKey(
                name: "FK_Raffles_RaffleSeats_WinningSeatId",
                table: "Raffles");

            migrationBuilder.DropIndex(
                name: "IX_Raffles_WinningSeatId",
                table: "Raffles");

            migrationBuilder.DropColumn(
                name: "PrizeDescription",
                table: "Raffles");

            migrationBuilder.DropColumn(
                name: "WinningSeatId",
                table: "Raffles");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ChatMessages_Raffles_RaffleId",
                table: "ChatMessages");

            // Recreate the old singular columns BEFORE dropping RafflePrizes,
            // so the rank-1 backfill below has something to read from. This
            // is lossy for any raffle with more than one prize (only rank 1
            // survives a down-migration) - acceptable for a down-migration,
            // not a concern for forward development.
            migrationBuilder.AddColumn<string>(
                name: "PrizeDescription",
                table: "Raffles",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "WinningSeatId",
                table: "Raffles",
                type: "int",
                nullable: true);

            migrationBuilder.Sql(@"
                UPDATE Raffles
                SET PrizeDescription = p.Description, WinningSeatId = p.WinningSeatId
                FROM RafflePrizes p
                WHERE p.RaffleId = Raffles.Id AND p.Rank = 1;
            ");

            migrationBuilder.DropTable(
                name: "RafflePrizes");

            migrationBuilder.DropIndex(
                name: "IX_ChatMessages_RaffleId_SentAtUtc",
                table: "ChatMessages");

            migrationBuilder.DropColumn(
                name: "DrawMode",
                table: "Raffles");

            migrationBuilder.DropColumn(
                name: "ScheduledDrawAtUtc",
                table: "Raffles");

            migrationBuilder.DropColumn(
                name: "RaffleId",
                table: "ChatMessages");

            migrationBuilder.AlterColumn<int>(
                name: "AuctionId",
                table: "ChatMessages",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Raffles_WinningSeatId",
                table: "Raffles",
                column: "WinningSeatId");

            migrationBuilder.AddForeignKey(
                name: "FK_Raffles_RaffleSeats_WinningSeatId",
                table: "Raffles",
                column: "WinningSeatId",
                principalTable: "RaffleSeats",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
