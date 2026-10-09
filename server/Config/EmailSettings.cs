namespace SellWithEllie.Config;

// Bound from the "Email" configuration section. SmtpUsername/SmtpPassword
// are sensitive - set them via
// `dotnet user-secrets set "Email:SmtpPassword" "..."` in development,
// never in appsettings.json. Left unconfigured, transactional emails are
// silently skipped (see EmailSender) - checkout, bidding, registration and
// every other core flow works exactly the same whether or not email is set
// up, matching the Xendit/BlobStorage graceful-degradation pattern used
// elsewhere in this app.
public class EmailSettings
{
    public const string SectionName = "Email";

    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; } = 587;
    public string SmtpUsername { get; set; } = string.Empty;
    public string SmtpPassword { get; set; } = string.Empty;
    public bool EnableSsl { get; set; } = true;

    public string FromAddress { get; set; } = string.Empty;
    public string FromName { get; set; } = "SellWithEllie";
}
