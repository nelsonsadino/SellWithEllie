using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SellWithEllie.Migrations
{
    /// <inheritdoc />
    public partial class AddAuctionStatusIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Auctions_Status_EndTimeUtc",
                table: "Auctions",
                columns: new[] { "Status", "EndTimeUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Auctions_Status_StartTimeUtc",
                table: "Auctions",
                columns: new[] { "Status", "StartTimeUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Auctions_Status_EndTimeUtc",
                table: "Auctions");

            migrationBuilder.DropIndex(
                name: "IX_Auctions_Status_StartTimeUtc",
                table: "Auctions");
        }
    }
}
