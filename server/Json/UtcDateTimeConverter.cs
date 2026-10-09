using System.Text.Json;
using System.Text.Json.Serialization;

namespace SellWithEllie.Json;

// Every DateTime in this API is UTC (auction start/end, order dates, etc.),
// but EF Core reads SQL Server's `datetime2` back with DateTimeKind.Unspecified,
// so System.Text.Json's default converter serializes it with no 'Z'/offset.
// A client's `new Date(...)` then parses that string as local time instead
// of UTC - every countdown in the app silently drifts by the browser's UTC
// offset. This converter forces Kind=Utc before serializing (and assumes
// Utc when reading, matching how these values are actually stored) so the
// wire format always carries the 'Z' suffix.
public class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetDateTime();
        return DateTime.SpecifyKind(value, DateTimeKind.Utc);
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var utc = value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        writer.WriteStringValue(utc);
    }
}

public class UtcNullableDateTimeConverter : JsonConverter<DateTime?>
{
    public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        var value = reader.GetDateTime();
        return DateTime.SpecifyKind(value, DateTimeKind.Utc);
    }

    public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
            return;
        }
        var utc = value.Value.Kind == DateTimeKind.Utc ? value.Value : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
        writer.WriteStringValue(utc);
    }
}
