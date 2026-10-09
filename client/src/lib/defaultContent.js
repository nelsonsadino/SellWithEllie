// The shipped copy for every editable string on the storefront. A shop admin
// overrides any of these per-shop in Admin > Storefront > Content; an override
// with an empty value falls back to the string here.
//
// Keys are dotted and grouped by screen. Keep this list and the Content editor
// groups (AdminStorefrontPanel CONTENT_GROUPS) in sync.
export const DEFAULT_CONTENT = {
  // -- Announcement bar (blank = hidden) --
  'announcement.text': '',
  'announcement.linkLabel': '',
  'announcement.href': '',

  // -- Global nav / chrome --
  'nav.shop': 'Shop',
  'nav.auctions': 'Auctions',
  'nav.about': 'About',
  'nav.admin': 'Admin',
  'nav.cart': 'Cart',
  'nav.account': 'My account',
  'nav.login': 'Log in',
  'nav.signup': 'Sign up',
  'nav.logout': 'Log out',

  // -- Footer --
  'footer.tagline': 'Thanks for stopping by.',
  'footer.copyright': 'All rights reserved.',

  // -- Home (fallbacks when a shop has no Hero block) --
  'home.hero.title': 'Welcome to our shop',
  'home.hero.subtitle': 'Browse what we have for sale today, or bid on select items in a live auction.',
  'home.hero.primaryCta': 'Shop now',
  'home.hero.secondaryCta': 'View auctions',
  'home.products.heading': 'Newly listed',
  'home.products.seeAll': 'See all',
  'home.auctions.heading': 'Live auctions',

  // -- Products list --
  'products.title': 'Everything for sale',
  'products.subtitle': 'Search and filter the full catalog.',
  'products.searchPlaceholder': 'Search products…',
  'products.empty': 'No products match your search yet.',
  'products.addToCart': 'Add to cart',

  // -- Product detail --
  'product.addToCart': 'Add to cart',
  'product.outOfStock': 'Not available',
  'product.auctionOnly': 'This item is sold via auction only.',

  // -- Auctions --
  'auctions.title': 'Live & upcoming auctions',
  'auctions.subtitle': 'Bidding updates in real time.',
  'auctions.empty': 'No auctions running right now. Check back soon.',
  'auction.placeBid': 'Place bid',
  'auction.buyNow': 'Buy it now',
  'auction.endsIn': 'Ends in',

  // -- Cart / checkout --
  'cart.title': 'Your cart',
  'cart.empty': 'Your cart is empty.',
  'cart.checkout': 'Checkout',
  'cart.subtotal': 'Subtotal',
  'checkout.title': 'Checkout',
  'checkout.placeOrder': 'Place order',
  'checkout.success': 'Order placed. Thank you!',

  // -- Orders --
  'orders.title': 'Your orders',
  'orders.empty': "You haven't placed any orders yet.",

  // -- About --
  'about.title': 'About this shop',

  // -- Auth --
  'auth.login.title': 'Welcome back',
  'auth.login.submit': 'Log in',
  'auth.register.title': 'Create your account',
  'auth.register.submit': 'Sign up',
}

// content(key) -> shipped default, or '' if the key is unknown.
export function defaultContent(key) {
  return DEFAULT_CONTENT[key] ?? ''
}
