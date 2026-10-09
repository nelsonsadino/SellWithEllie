using System.Net.Http.Headers;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Facebook;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;
using SellWithEllie.Config;
using SellWithEllie.Data;
using SellWithEllie.Hubs;
using SellWithEllie.Json;
using SellWithEllie.Middleware;
using SellWithEllie.Models;
using SellWithEllie.Services;

// ---- Bootstrap logger -----------------------------------------------------
// Active only until the full Serilog pipeline below is wired up during
// builder.Host.UseSerilog(...) - catches anything that goes wrong before
// then (including a bad configuration file) and guarantees Log.CloseAndFlush
// in the finally block always has a logger to flush, even on the earliest
// possible startup failure.
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    Log.Information("Starting SellWithEllie API");

    var builder = WebApplication.CreateBuilder(args);

    // Full structured-logging pipeline: console (human-readable, for local dev)
    // plus a rolling newline-delimited-JSON file (machine-readable, so a log
    // aggregator or a simple grep/jq over "logs/" gives real error tracking
    // without any paid SaaS). Replaces the framework's default console logger
    // entirely - every ILogger<T> call anywhere in the app (including the
    // per-request summary from UseSerilogRequestLogging below and the global
    // exception handler's LogError) flows through this from here on.
    builder.Host.UseSerilog((context, services, loggerConfiguration) => loggerConfiguration
        .MinimumLevel.Information()
        .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
        .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Application", "SellWithEllie")
        .WriteTo.Console()
        .WriteTo.File(
            new CompactJsonFormatter(),
            Path.Combine(AppContext.BaseDirectory, "logs", "log-.json"),
            rollingInterval: RollingInterval.Day,
            retainedFileCountLimit: 14));

    // ---- Configuration ----------------------------------------------------
    builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection(JwtSettings.SectionName));
    var jwtSettings = builder.Configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>()
        ?? throw new InvalidOperationException("Jwt configuration section is missing.");

    if (string.IsNullOrWhiteSpace(jwtSettings.Key) || jwtSettings.Key.Length < 32)
    {
        throw new InvalidOperationException(
            "Jwt:Key is missing or too short. Set a random string of 32+ characters via " +
            "'dotnet user-secrets set \"Jwt:Key\" \"...\"' in development, or an app setting in production. " +
            "Refusing to start with a weak/absent signing key.");
    }

    var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
    var rootDomain = builder.Configuration["RootDomain"];

    builder.Services.Configure<XenditSettings>(builder.Configuration.GetSection(XenditSettings.SectionName));
    var xenditSettings = builder.Configuration.GetSection(XenditSettings.SectionName).Get<XenditSettings>()
        ?? new XenditSettings();
    if (string.IsNullOrWhiteSpace(xenditSettings.SecretKey))
    {
        Log.Warning("Xendit:SecretKey is not configured - billing endpoints will return 503 until it is set via user-secrets.");
    }

    builder.Services.Configure<ExternalAuthSettings>(builder.Configuration.GetSection(ExternalAuthSettings.SectionName));
    var externalAuthSettings = builder.Configuration.GetSection(ExternalAuthSettings.SectionName).Get<ExternalAuthSettings>()
        ?? new ExternalAuthSettings();
    if (string.IsNullOrWhiteSpace(externalAuthSettings.GoogleClientId) || string.IsNullOrWhiteSpace(externalAuthSettings.GoogleClientSecret))
    {
        Log.Warning("ExternalAuth:GoogleClientId/GoogleClientSecret are not fully configured - 'Continue with Google' will return 503 until they are set via user-secrets.");
    }
    if (string.IsNullOrWhiteSpace(externalAuthSettings.FacebookAppId) || string.IsNullOrWhiteSpace(externalAuthSettings.FacebookAppSecret))
    {
        Log.Warning("ExternalAuth:FacebookAppId/FacebookAppSecret are not fully configured - 'Continue with Facebook' will return 503 until they are set via user-secrets.");
    }

    builder.Services.Configure<BlobStorageSettings>(builder.Configuration.GetSection(BlobStorageSettings.SectionName));
    var blobStorageSettings = builder.Configuration.GetSection(BlobStorageSettings.SectionName).Get<BlobStorageSettings>()
        ?? new BlobStorageSettings();
    if (string.IsNullOrWhiteSpace(blobStorageSettings.ConnectionString))
    {
        Log.Warning("BlobStorage:ConnectionString is not configured - product photo/video upload endpoints will return 503 until it is set via user-secrets.");
    }

    builder.Services.Configure<EmailSettings>(builder.Configuration.GetSection(EmailSettings.SectionName));
    var emailSettings = builder.Configuration.GetSection(EmailSettings.SectionName).Get<EmailSettings>()
        ?? new EmailSettings();
    if (string.IsNullOrWhiteSpace(emailSettings.SmtpHost) || string.IsNullOrWhiteSpace(emailSettings.FromAddress))
    {
        Log.Warning("Email:SmtpHost/FromAddress are not fully configured - transactional emails (welcome, order confirmation, auction win/outbid alerts) will be silently skipped until they are set via user-secrets.");
    }

    builder.Services.Configure<PaymentsSettings>(builder.Configuration.GetSection(PaymentsSettings.SectionName));
    var paymentsSettings = builder.Configuration.GetSection(PaymentsSettings.SectionName).Get<PaymentsSettings>()
        ?? new PaymentsSettings();
    if (string.IsNullOrWhiteSpace(paymentsSettings.EncryptionKey))
    {
        Log.Warning("Payments:EncryptionKey is not configured - shops cannot connect their own Xendit account; customer checkout stays on the simulated flow. Set a base64 32-byte key via user-secrets to enable it.");
    }

    // ---- Services -----------------------------------------------------------
    builder.Services.AddScoped<ITenantContext, TenantContext>();
    builder.Services.AddSingleton<ITenantCache, TenantCache>();

    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseSqlServer(
            builder.Configuration.GetConnectionString("DefaultConnection"),
            sqlOptions => sqlOptions.EnableRetryOnFailure(
                maxRetryCount: 5,
                maxRetryDelay: TimeSpan.FromSeconds(10),
                errorNumbersToAdd: null)));

    builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = false;
        options.User.RequireUniqueEmail = true;
        options.Lockout.MaxFailedAccessAttempts = 8;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
    })
        .AddEntityFrameworkStores<ApplicationDbContext>()
        .AddDefaultTokenProviders();

    var authenticationBuilder = builder.Services
        .AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        })
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = jwtSettings.Issuer,
                ValidateAudience = true,
                ValidAudience = jwtSettings.Audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Key)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30)
            };

            // Browsers cannot set an Authorization header on the WebSocket
            // handshake SignalR uses, so the client sends the JWT as a query
            // string parameter on that one path instead; everywhere else the
            // normal Authorization header is required.
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];
                    var path = context.HttpContext.Request.Path;
                    if (!string.IsNullOrEmpty(accessToken) &&
                        (path.StartsWithSegments("/hubs/auction") || path.StartsWithSegments("/hubs/raffle")))
                    {
                        context.Token = accessToken;
                    }
                    return Task.CompletedTask;
                },

                // Server-side revocation without a token store: the JWT carries a
                // snapshot of the user's Identity SecurityStamp. Rotating that
                // stamp (password change, or POST /api/auth/logout = "sign out
                // everywhere") instantly invalidates every token issued before.
                // The current stamp is cached for 60s so this costs at most one
                // extra DB read per user per minute.
                OnTokenValidated = async context =>
                {
                    var stampInToken = context.Principal?.FindFirst("sstamp")?.Value;
                    if (string.IsNullOrEmpty(stampInToken))
                    {
                        context.Fail("Token is missing its security stamp.");
                        return;
                    }

                    var userId = context.Principal!.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                    if (string.IsNullOrEmpty(userId))
                    {
                        context.Fail("Token is missing its subject.");
                        return;
                    }

                    var services = context.HttpContext.RequestServices;
                    var cache = services.GetRequiredService<IMemoryCache>();
                    var currentStamp = await cache.GetOrCreateAsync($"sstamp:{userId}", async entry =>
                    {
                        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60);
                        // Read the stamp directly, IGNORING the ApplicationUser
                        // tenant query filter: identity is global, and a request
                        // that arrives with a mismatched/absent X-Tenant-Slug
                        // must not cause FindById to return null and poison this
                        // cache entry (locking the user out of their own shop for
                        // the cache TTL). The tenant match is enforced separately
                        // by the "tid" middleware below.
                        var db = services.GetRequiredService<ApplicationDbContext>();
                        return await db.Users
                            .IgnoreQueryFilters()
                            .Where(u => u.Id == userId)
                            .Select(u => u.SecurityStamp)
                            .FirstOrDefaultAsync();
                    });

                    if (currentStamp is null || !string.Equals(currentStamp, stampInToken, StringComparison.Ordinal))
                    {
                        context.Fail("Session has been revoked. Please sign in again.");
                    }
                }
            };
        })
        .AddCookie(SellWithEllie.Controllers.ExternalAuthController.CookieScheme, options =>
        {
            // Only alive for the few seconds of a Google/Facebook sign-in round
            // trip (see ExternalAuthController) - never used to authenticate a
            // normal API call, which stays JWT-only via the scheme above.
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.ExpireTimeSpan = TimeSpan.FromMinutes(10);
            options.SlidingExpiration = false;
        });

    // Google/Facebook are only registered at all when both of their credentials
    // are configured - NOT registered-but-inert like Xendit's settings above.
    // Remote OAuth handlers (unlike JwtBearer) implement IAuthenticationRequestHandler,
    // so ASP.NET Core's authentication middleware checks EVERY handler's options
    // on EVERY incoming request (to see whether that request matches its
    // callback path) - not just when a request actually challenges that scheme.
    // Registering AddGoogle()/AddFacebook() with a blank ClientId would therefore
    // throw ArgumentException("The 'ClientId' option must be provided") on every
    // single request in the app, not just OAuth ones, since GoogleOptions'
    // required-field validation runs as part of that per-request check.
    if (!string.IsNullOrWhiteSpace(externalAuthSettings.GoogleClientId) && !string.IsNullOrWhiteSpace(externalAuthSettings.GoogleClientSecret))
    {
        authenticationBuilder.AddGoogle(options =>
        {
            options.ClientId = externalAuthSettings.GoogleClientId;
            options.ClientSecret = externalAuthSettings.GoogleClientSecret;
            options.SignInScheme = SellWithEllie.Controllers.ExternalAuthController.CookieScheme;
            options.CallbackPath = "/signin-google";
        });
    }

    if (!string.IsNullOrWhiteSpace(externalAuthSettings.FacebookAppId) && !string.IsNullOrWhiteSpace(externalAuthSettings.FacebookAppSecret))
    {
        authenticationBuilder.AddFacebook(options =>
        {
            options.AppId = externalAuthSettings.FacebookAppId;
            options.AppSecret = externalAuthSettings.FacebookAppSecret;
            options.SignInScheme = SellWithEllie.Controllers.ExternalAuthController.CookieScheme;
            options.CallbackPath = "/signin-facebook";
            options.Scope.Add("email");
            options.Fields.Add("email");
            options.Fields.Add("name");
        });
    }

    builder.Services.AddAuthorization();

    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

        // Login / register / OAuth start: 10 attempts per minute PER CLIENT IP,
        // so one caller hammering the endpoint can't lock everyone else out and
        // (with the account lockout in AuthController) brute force is bounded on
        // both axes. Behind a CDN/proxy this needs UseForwardedHeaders so the
        // real client IP is seen here rather than the edge's.
        options.AddPolicy("auth", httpContext =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));

        // A loose global backstop keyed by IP for everything else (OWASP API4 -
        // unrestricted resource consumption). Generous so normal browsing + an
        // active auction never trips it; tune against real traffic. SignalR
        // messages over an established socket don't pass through here.
        options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                factory: _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 600,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));
    });

    // Shop storefronts live on wildcard subdomains of RootDomain (and on
    // *.localhost in dev), which a plain WithOrigins() allow-list can't
    // express, so origins are validated with a predicate instead.
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowFrontend", policy =>
        {
            policy.SetIsOriginAllowed(origin =>
            {
                if (allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) return true;
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var originUri)) return false;

                var host = originUri.Host;
                if (host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase)) return true;
                if (string.IsNullOrWhiteSpace(rootDomain)) return false;

                return host.Equals(rootDomain, StringComparison.OrdinalIgnoreCase)
                    || host.EndsWith("." + rootDomain, StringComparison.OrdinalIgnoreCase);
            })
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        });
    });

    builder.Services.AddMemoryCache();

    // Liveness/readiness probe for a load balancer, container orchestrator, or
    // uptime monitor - checks the app can actually reach its database, not just
    // that the process is running. Deliberately unauthenticated and outside the
    // tenant system (see app.MapHealthChecks below) since infrastructure has no
    // shop context.
    builder.Services.AddHealthChecks()
        .AddDbContextCheck<ApplicationDbContext>("database");

    // Short-lived cache for the highest-traffic, fully public, unauthenticated
    // reads (product/auction listing pages) - the ones a traffic spike hits
    // hardest. Vary by the tenant header/host so two shops' storefronts never
    // share a cached response, and authorization (see app.UseOutputCache's
    // placement below, after UseAuthorization) still runs on every request
    // regardless of cache state. Tagged "catalog" so an admin create/update/
    // delete evicts it immediately instead of waiting out the short TTL.
    builder.Services.AddOutputCache(options =>
    {
        options.AddPolicy("PublicCatalog", policy => policy
            .Expire(TimeSpan.FromSeconds(20))
            .SetVaryByHeader("X-Tenant-Slug", "Host")
            .Tag("catalog"));
    });

    // Shrinks the JSON payloads on the list-heavy endpoints (catalogue,
    // orders, inventory). EnableForHttps is safe here: normal API calls are
    // authenticated by JWT bearer token only - the one cookie this app issues
    // (see .AddCookie above) lives for seconds during an OAuth round trip and
    // is never ambient credential for a GET, so there's no cross-site actor
    // who can replay a request and observe compressed response size (the
    // BREACH scenario response compression over TLS is normally risky for).
    builder.Services.AddResponseCompression(options =>
    {
        options.EnableForHttps = true;
        options.Providers.Add<BrotliCompressionProvider>();
        options.Providers.Add<GzipCompressionProvider>();
        options.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["application/json"]);
    });

    // HSTS: 1 year, cover subdomains (shops live on them), preload-eligible.
    // Only emitted in non-Development (see app.UseHsts below).
    builder.Services.AddHsts(options =>
    {
        options.MaxAge = TimeSpan.FromDays(365);
        options.IncludeSubDomains = true;
        options.Preload = true;
    });

    // Behind a CDN / reverse proxy the real client IP and scheme arrive in
    // X-Forwarded-* headers; without this, per-IP rate limiting and logging see
    // only the edge's address. KnownProxies / KnownNetworks MUST be set to the
    // CDN's ranges in production (via config) - the empty defaults here mean the
    // headers are honoured only from a loopback proxy, which is safe by default.
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.KnownNetworks.Clear();
        options.KnownProxies.Clear();
        foreach (var proxy in builder.Configuration.GetSection("KnownProxies").Get<string[]>() ?? Array.Empty<string>())
        {
            if (System.Net.IPAddress.TryParse(proxy, out var ip)) options.KnownProxies.Add(ip);
        }
    });

    builder.Services.AddControllers().AddJsonOptions(o =>
    {
        // See Json/UtcDateTimeConverter.cs - every DateTime this API returns
        // is UTC; without this the wire format silently drops the 'Z' and
        // every client-side countdown misreads it as local time.
        o.JsonSerializerOptions.Converters.Add(new UtcDateTimeConverter());
        o.JsonSerializerOptions.Converters.Add(new UtcNullableDateTimeConverter());
    });
    builder.Services.AddSignalR().AddJsonProtocol(o =>
    {
        // SignalR's JsonHubProtocol has its own serializer options, separate
        // from AddControllers().AddJsonOptions() above - bid/chat timestamps
        // pushed over the hub need the same fix or they drift for anyone
        // watching an auction live.
        o.PayloadSerializerOptions.Converters.Add(new UtcDateTimeConverter());
        o.PayloadSerializerOptions.Converters.Add(new UtcNullableDateTimeConverter());
    });
    builder.Services.AddScoped<ITokenService, TokenService>();
    builder.Services.AddHttpClient<IXenditClient, XenditClient>((sp, client) =>
    {
        var settings = sp.GetRequiredService<IOptions<XenditSettings>>().Value;
        client.BaseAddress = new Uri("https://api.xendit.co");
        if (!string.IsNullOrWhiteSpace(settings.SecretKey))
        {
            var basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{settings.SecretKey}:"));
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", basicAuth);
        }
    });
    builder.Services.AddScoped<IAuctionService, AuctionService>();
    builder.Services.AddScoped<CheckoutService>();
    builder.Services.AddHostedService<AuctionStatusBackgroundService>();
    // No new BackgroundService for raffles: every state transition is
    // event-driven (admin action, customer reserve, payment webhook) -
    // raffles have no wall-clock deadline the way auctions do, so there is
    // nothing to poll for.
    builder.Services.AddScoped<IRaffleService, RaffleService>();
    builder.Services.AddSingleton<IBlobStorageService, BlobStorageService>();
    builder.Services.AddSingleton<IProfanityFilterService, ProfanityFilterService>();
    builder.Services.AddSingleton<IChatRateLimiter, ChatRateLimiter>();
    builder.Services.AddSingleton<IEmailSender, EmailSender>();
    builder.Services.AddSingleton<ISecretCipher, SecretCipher>();
    builder.Services.AddSingleton<ITenantPaymentService, TenantPaymentService>();
    builder.Services.AddSingleton<IReturnUrlValidator, ReturnUrlValidator>();
    builder.Services.AddScoped<IAuditLogService, AuditLogService>();

    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(options =>
    {
        options.SwaggerDoc("v1", new OpenApiInfo { Title = "SellWithEllie API", Version = "v1" });

        options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.ApiKey,
            Scheme = "Bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "Paste just the token - Swagger adds the 'Bearer ' prefix for you."
        });

        options.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
                },
                Array.Empty<string>()
            }
        });
    });

    var app = builder.Build();

    // ---- Database migration + seeding ---------------------------------------
    // Auto-migrating on boot is convenient in dev and small deploys but risky at
    // scale (a slow migration blocks startup; a bad one takes the app down).
    // Set Database:MigrateOnStartup=false in production and run migrations as a
    // deliberate, gated step instead.
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (app.Configuration.GetValue("Database:MigrateOnStartup", true))
        {
            db.Database.Migrate();
        }
        await DbInitializer.SeedAsync(scope.ServiceProvider, app.Configuration, app.Logger);
    }

    // ---- Middleware pipeline --------------------------------------------------
    if (app.Environment.IsDevelopment())
    {
        app.UseDeveloperExceptionPage();
        app.UseSwagger();
        app.UseSwaggerUI();
    }
    else
    {
        // Generic error responses in production - never leak stack traces or
        // exception details to the client.
        app.UseExceptionHandler(errorApp =>
        {
            errorApp.Run(async context =>
            {
                var feature = context.Features.Get<IExceptionHandlerFeature>();
                if (feature is not null)
                {
                    app.Logger.LogError(feature.Error, "Unhandled exception processing {Path}", context.Request.Path);
                }

                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                context.Response.ContentType = "application/json";
                await context.Response.WriteAsJsonAsync(new { message = "An unexpected error occurred." });
            });
        });
        app.UseHsts();
    }

    app.UseSerilogRequestLogging();

    // Security headers on every response. This is a JSON API (the SPA is served
    // elsewhere and needs its own CSP from that host / the CDN), so the policy
    // here is deliberately a lockdown: nothing on an API response should ever
    // load a resource or be framed. Swagger UI is exempted so it still renders
    // in Development.
    app.Use(async (context, next) =>
    {
        var headers = context.Response.Headers;
        headers.Append("X-Content-Type-Options", "nosniff");
        headers.Append("X-Frame-Options", "DENY");
        headers.Append("Referrer-Policy", "no-referrer");
        headers.Append("Cross-Origin-Opener-Policy", "same-origin");
        headers.Append("Cross-Origin-Resource-Policy", "same-site");
        headers.Append("Permissions-Policy",
            "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), " +
            "fullscreen=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), " +
            "midi=(), payment=(), usb=()");

        if (!context.Request.Path.StartsWithSegments("/swagger"))
        {
            headers.Append("Content-Security-Policy",
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
        }

        // Never let an edge cache / CDN hold a response rendered for a signed-in
        // user (orders, cart, admin data). Checked at flush time, by when the
        // auth middleware downstream has populated context.User.
        context.Response.OnStarting(() =>
        {
            if (context.User?.Identity?.IsAuthenticated == true &&
                !context.Response.Headers.ContainsKey("Cache-Control"))
            {
                context.Response.Headers.CacheControl = "no-store";
            }
            return Task.CompletedTask;
        });

        await next();
    });

    // First in the pipeline: rewrite RemoteIpAddress / scheme from the proxy
    // headers before anything (rate limiter, logging) reads them.
    app.UseForwardedHeaders();

    // Must wrap everything that writes a response body, including the output
    // cache below - otherwise a cached response would be served uncompressed.
    app.UseResponseCompression();

    app.UseHttpsRedirection();
    app.UseCors("AllowFrontend");
    app.UseMiddleware<TenantResolutionMiddleware>();
    app.UseRateLimiter();
    app.UseAuthentication();

    // A JWT is only valid for the shop it was issued for. Shop-user tokens
    // carry a "tid" (tenant id) claim; platform-admin tokens carry none and
    // skip this check entirely, since they aren't scoped to any one shop.
    app.Use(async (context, next) =>
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var tenantClaim = context.User.FindFirst("tid")?.Value;
            if (!string.IsNullOrEmpty(tenantClaim))
            {
                var currentTenant = context.RequestServices.GetRequiredService<ITenantContext>();
                if (!int.TryParse(tenantClaim, out var tokenTenantId) || currentTenant.TenantId != tokenTenantId)
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    await context.Response.WriteAsJsonAsync(new { message = "This account does not belong to this shop." });
                    return;
                }
            }
        }
        await next();
    });

    app.UseAuthorization();
    app.UseOutputCache();

    app.MapControllers();
    app.MapHub<AuctionHub>("/hubs/auction");
    app.MapHub<RaffleHub>("/hubs/raffle");
    app.MapHealthChecks("/health");

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "SellWithEllie API terminated unexpectedly");
    throw;
}
finally
{
    Log.CloseAndFlush();
}
