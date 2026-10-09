namespace SellWithEllie.Dtos;

public class AuditLogEntryDto
{
    public int Id { get; set; }
    public string ActorDisplayName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? TargetType { get; set; }
    public string? TargetId { get; set; }
    public string? Details { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
