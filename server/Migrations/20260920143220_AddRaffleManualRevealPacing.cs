using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SellWithEllie.Migrations
{
    /// <inheritdoc />
    public partial class AddRaffleManualRevealPacing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "LastRevealedAtUtc",
                table: "Raffles",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RevealInProgress",
                table: "Raffles",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "RevealedPrizeCount",
                table: "Raffles",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // Any raffle already in the Drawn (2) status finished its reveal
            // under the old auto-cascading-with-fixed-delay model, where
            // every prize was fully revealed by the time RaffleDrawn fired.
            // Backfill both columns so existing drawn raffles keep showing
            // their winners under the new reveal-gated mapping, instead of
            // suddenly appearing "not revealed yet" with nothing left to
            // trigger a reveal on them.
            migrationBuilder.Sql(@"
                UPDATE r
                SET r.RevealedPrizeCount = (SELECT COUNT(*) FROM RafflePrizes p WHERE p.RaffleId = r.Id),
                    r.LastRevealedAtUtc = r.DrawnAtUtc
                FROM Raffles r
                WHERE r.Status = 2;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastRevealedAtUtc",
                table: "Raffles");

            migrationBuilder.DropColumn(
                name: "RevealInProgress",
                table: "Raffles");

            migrationBuilder.DropColumn(
                name: "RevealedPrizeCount",
                table: "Raffles");
        }
    }
}
