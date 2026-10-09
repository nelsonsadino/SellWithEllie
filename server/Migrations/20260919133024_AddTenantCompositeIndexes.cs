using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SellWithEllie.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantCompositeIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_CreatedAtUtc",
                table: "Products",
                columns: new[] { "TenantId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_TenantId_OrderDateUtc",
                table: "Orders",
                columns: new[] { "TenantId", "OrderDateUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Auctions_TenantId_EndTimeUtc",
                table: "Auctions",
                columns: new[] { "TenantId", "EndTimeUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Products_TenantId_CreatedAtUtc",
                table: "Products");

            migrationBuilder.DropIndex(
                name: "IX_Orders_TenantId_OrderDateUtc",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Auctions_TenantId_EndTimeUtc",
                table: "Auctions");
        }
    }
}
