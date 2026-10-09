using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using SellWithEllie.Services;

namespace SellWithEllie.Controllers;

// Base class for any controller whose data belongs to exactly one shop.
// Fails closed: if no tenant could be resolved for this request (unknown
// or missing subdomain/header), every action on the controller returns 404
// instead of silently falling through to "no filter".
[ApiController]
public abstract class TenantScopedControllerBase : ControllerBase, IActionFilter
{
    protected readonly ITenantContext TenantContext;

    protected TenantScopedControllerBase(ITenantContext tenantContext)
    {
        TenantContext = tenantContext;
    }

    // [NonAction] is required here: these are IActionFilter interface
    // methods, not endpoints, but ASP.NET Core's action discovery treats any
    // public method on a controller-derived type as a potential action
    // unless told otherwise. Without this, every controller that inherits
    // from this base class (Products, Auctions, Cart, Orders, Platform, ...)
    // gets a phantom "action" with no HTTP verb attached, which Swashbuckle
    // can't describe and throws SwaggerGeneratorException("Ambiguous HTTP
    // method for action") on - it doesn't affect real routing (these were
    // never reachable as endpoints either way, since they have no route
    // attribute), just Swagger's ability to generate a document at all.
    [NonAction]
    public void OnActionExecuting(ActionExecutingContext context)
    {
        if (TenantContext.TenantId is null)
        {
            context.Result = new NotFoundObjectResult(new { message = "Unknown shop." });
        }
    }

    [NonAction]
    public void OnActionExecuted(ActionExecutedContext context)
    {
    }
}
