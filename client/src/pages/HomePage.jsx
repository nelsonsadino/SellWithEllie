import { useMemo } from 'react'
import LiveAuctionSpotlight from '../components/LiveAuctionSpotlight'
import RaffleModesShowcase from '../components/RaffleModesShowcase'
import RaffleSpotlight from '../components/RaffleSpotlight'
import SectionRenderer from '../components/SectionRenderer'
import { useContent, useTenant } from '../context/TenantContext'

// The storefront home is composed of editable blocks the shop arranges in
// Admin > Storefront. With no blocks yet (or a backend that predates the
// feature) it falls back to a sensible default stack built from the shop's copy.
export default function HomePage() {
  const { sections, tenant } = useTenant()
  const t = useContent()

  const fallback = useMemo(
    () => [
      {
        id: 'fallback-hero',
        kind: 'hero',
        isVisible: true,
        data: {
          title: t('home.hero.title', tenant?.name || 'Welcome'),
          subtitle: t('home.hero.subtitle', 'A small shop with a considered selection. New pieces added often.'),
          primaryLabel: t('home.hero.primaryCta', 'Shop all'),
          primaryHref: '/products',
          secondaryLabel: t('home.hero.secondaryCta', 'Live auctions'),
          secondaryHref: '/auctions',
        },
      },
      {
        id: 'fallback-products',
        kind: 'productGrid',
        isVisible: true,
        data: { heading: t('home.products.heading', 'New arrivals'), limit: 8, sort: 'newest' },
      },
      {
        id: 'fallback-features',
        kind: 'featureGrid',
        isVisible: true,
        data: {
          heading: '',
          items: [
            { title: 'Considered selection', body: 'Every item is chosen and checked before it goes up.' },
            { title: 'Secure checkout', body: 'Your account and orders are protected end to end.' },
            { title: 'Live auctions', body: 'Bid in real time on limited pieces.' },
          ],
        },
      },
      {
        id: 'fallback-cta',
        kind: 'cta',
        isVisible: true,
        data: {
          title: 'See something you like?',
          body: 'New pieces are added continually. Make an account to save your cart and check out.',
          buttonLabel: 'Browse everything',
          buttonHref: '/products',
        },
      },
    ],
    [t, tenant?.name]
  )

  const blocks = sections && sections.length > 0 ? sections : fallback

  // The spotlight sits mid-scroll, not as a doorway - a shopper who has
  // already browsed a little (past the hero, past the first products) is a
  // better audience for "come bid on this" than someone who just landed.
  const mid = Math.ceil(blocks.length / 2)

  return (
    <>
      <SectionRenderer sections={blocks.slice(0, mid)} />
      <LiveAuctionSpotlight />
      <RaffleModesShowcase />
      <RaffleSpotlight />
      <SectionRenderer sections={blocks.slice(mid)} />
    </>
  )
}
