using System.Net;

namespace SellWithEllie.Services;

// Minimal inline HTML templates for transactional email. Deliberately plain
// (no external CSS framework, no images) so they render consistently across
// email clients without extra infrastructure.
//
// Every value interpolated into HtmlEncoded HTML below is either admin-
// authored (shop name, product name, raffle title/prize description) or the
// recipient's own display name - none of it is safe to trust as-is. A shop
// name is chosen at self-serve signup with only a length cap, no HTML
// stripping, and then gets embedded in transactional emails sent to that
// shop's real customers (order confirmations, auction/raffle wins) - so an
// unescaped `<img src=x onerror=...>` shop name would be a genuine stored
// HTML-injection reaching third parties, not just the shop owner's own
// inbox. Subjects are plain text (never rendered as HTML by a mail client)
// so they're left as-is; only the HTML bodies are encoded.
public static class EmailTemplates
{
    private static string E(string value) => WebUtility.HtmlEncode(value);

    private static string Wrap(string title, string bodyHtml) => $@"
<div style=""font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;"">
  <h2 style=""margin:0 0 16px;"">{E(title)}</h2>
  {bodyHtml}
  <p style=""margin-top:32px;font-size:12px;color:#777;"">This is an automated message - please don't reply directly to this email.</p>
</div>";

    public static (string Subject, string Html) Welcome(string displayName, string shopName)
    {
        var subject = $"Welcome to {shopName}!";
        var html = Wrap(subject, $@"<p>Hi {E(displayName)},</p><p>Your account at <strong>{E(shopName)}</strong> is ready. Happy shopping!</p>");
        return (subject, html);
    }

    public static (string Subject, string Html) OrderConfirmation(string displayName, string shopName, int orderId, decimal total, IEnumerable<string> itemNames)
    {
        var subject = $"Your {shopName} order #{orderId} is confirmed";
        var items = string.Join("", itemNames.Select(n => $"<li>{E(n)}</li>"));
        var html = Wrap(subject, $@"
<p>Hi {E(displayName)},</p>
<p>Thanks for your order at <strong>{E(shopName)}</strong>. Here's a summary:</p>
<ul>{items}</ul>
<p><strong>Total: {total:0.00}</strong></p>");
        return (subject, html);
    }

    public static (string Subject, string Html) OrderShipped(string displayName, string shopName, int orderId, string? carrier, string? trackingNumber)
    {
        var subject = $"Your {shopName} order #{orderId} has shipped";
        var track = string.IsNullOrWhiteSpace(trackingNumber)
            ? string.Empty
            : $"<p>Carrier: <strong>{E(carrier ?? "-")}</strong><br/>Tracking number: <strong>{E(trackingNumber)}</strong></p>";
        var html = Wrap(subject, $@"
<p>Hi {E(displayName)},</p>
<p>Good news - your order <strong>#{orderId}</strong> from {E(shopName)} is on its way.</p>{track}");
        return (subject, html);
    }

    public static (string Subject, string Html) OrderDelivered(string displayName, string shopName, int orderId)
    {
        var subject = $"Your {shopName} order #{orderId} was delivered";
        var html = Wrap(subject, $@"
<p>Hi {E(displayName)},</p>
<p>Your order <strong>#{orderId}</strong> from {E(shopName)} has been delivered. We hope you love it - a quick review helps other shoppers.</p>");
        return (subject, html);
    }

    public static (string Subject, string Html) AuctionOutbid(string displayName, string shopName, string productName, decimal newAmount)
    {
        var subject = $"You've been outbid on {productName}";
        var html = Wrap(subject, $@"
<p>Hi {E(displayName)},</p>
<p>Someone just placed a higher bid of <strong>{newAmount:0.00}</strong> on <strong>{E(productName)}</strong> at {E(shopName)}. Head back to the auction if you'd like to bid again.</p>");
        return (subject, html);
    }

    public static (string Subject, string Html) AuctionWon(string displayName, string shopName, string productName, decimal winningAmount)
    {
        var subject = $"You won the auction for {productName}!";
        var html = Wrap(subject, $@"
<p>Hi {E(displayName)},</p>
<p>Congratulations - you won <strong>{E(productName)}</strong> at {E(shopName)} for <strong>{winningAmount:0.00}</strong>.</p>");
        return (subject, html);
    }

    public static (string Subject, string Html) RaffleWon(string displayName, string shopName, string raffleTitle, string prizeDescription, int seatNumber, int rank)
    {
        var ordinal = rank switch { 1 => "1st", 2 => "2nd", 3 => "3rd", _ => $"{rank}th" };
        var subject = $"You won {ordinal} prize in the {raffleTitle} raffle!";
        var html = Wrap(subject, $@"
<p>Hi {E(displayName)},</p>
<p>Congratulations - seat #{seatNumber} was drawn for <strong>{ordinal} prize</strong> in <strong>{E(raffleTitle)}</strong> at {E(shopName)}. Your prize: <strong>{E(prizeDescription)}</strong>.</p>");
        return (subject, html);
    }
}
