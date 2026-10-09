import { useTenant } from '../context/TenantContext'

export default function AboutPage() {
  const { tenant } = useTenant()
  const shopName = tenant?.name || 'This shop'

  return (
    <div className="container section about-page">
      <div className="page-header">
        <h1>About {shopName}</h1>
        <p>Here's how shopping and auctions work here.</p>
      </div>

      <div className="about-grid">
        <section>
          <h2>Our story</h2>
          <p>
            {shopName} lists every product with the details you need to shop with confidence, and stands behind
            what it sells.
          </p>
        </section>

        <section>
          <h2>How buying works</h2>
          <p>
            Browse our products, add the ones you want to your cart, and check out. We'll follow up on next steps -
            no payment details are collected on this demo site.
          </p>
        </section>

        <section>
          <h2>How auctions work</h2>
          <p>
            Some items are offered through a live auction instead of a fixed price. Sign in, watch the countdown,
            and place a bid - if you're outbid, you'll see the new price update instantly. Highest bid when the
            clock hits zero wins.
          </p>
        </section>

        <section>
          <h2>Get in touch</h2>
          <p>Questions about a product or an order? Reach out through the contact details on this site.</p>
        </section>
      </div>
    </div>
  )
}
