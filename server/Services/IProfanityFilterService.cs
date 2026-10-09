namespace SellWithEllie.Services;

public interface IProfanityFilterService
{
    // Returns the message with any matched words replaced by asterisks of
    // the same length, plus whether anything was actually filtered (so
    // callers can flag the message / warn the sender without having to
    // re-diff the strings themselves).
    (string Filtered, bool WasFiltered) Filter(string message);
}
