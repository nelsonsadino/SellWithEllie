using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;
using SellWithEllie.Config;

namespace SellWithEllie.Services;

public class EmailSender : IEmailSender
{
    private readonly EmailSettings _settings;
    private readonly ILogger<EmailSender> _logger;

    public EmailSender(IOptions<EmailSettings> settings, ILogger<EmailSender> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_settings.SmtpHost) && !string.IsNullOrWhiteSpace(_settings.FromAddress);

    public async Task SendAsync(string toEmail, string toDisplayName, string subject, string htmlBody, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
        {
            _logger.LogDebug("Email skipped (Email:SmtpHost/FromAddress not configured): {Subject} -> {ToEmail}", subject, toEmail);
            return;
        }

        if (string.IsNullOrWhiteSpace(toEmail))
        {
            return;
        }

        try
        {
            using var client = new SmtpClient(_settings.SmtpHost, _settings.SmtpPort)
            {
                EnableSsl = _settings.EnableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network
            };

            if (!string.IsNullOrWhiteSpace(_settings.SmtpUsername))
            {
                client.Credentials = new NetworkCredential(_settings.SmtpUsername, _settings.SmtpPassword);
            }

            using var message = new MailMessage
            {
                From = new MailAddress(_settings.FromAddress, _settings.FromName),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true
            };
            message.To.Add(new MailAddress(toEmail, toDisplayName));

            await client.SendMailAsync(message, cancellationToken);
        }
        catch (Exception ex)
        {
            // A failed send should never break the checkout/bid/registration
            // flow it's attached to - log and move on.
            _logger.LogWarning(ex, "Failed to send email '{Subject}' to {ToEmail}.", subject, toEmail);
        }
    }
}
