namespace SellWithEllie.Services;

// Transactional email (order confirmations, auction win/outbid alerts,
// welcome messages). Every call is safe to make unconditionally - when
// Email:SmtpHost/FromAddress aren't configured, SendAsync is a silent no-op
// (see EmailSender), so no caller needs to check IsConfigured itself before
// sending; the checkout/bid/registration flow it's attached to always
// succeeds or fails on its own merits, never because of email.
public interface IEmailSender
{
    bool IsConfigured { get; }
    Task SendAsync(string toEmail, string toDisplayName, string subject, string htmlBody, CancellationToken cancellationToken = default);
}
