import Reveal from './Reveal'
import AuctionTickerSection from './sections/AuctionTickerSection'
import CarouselSection from './sections/CarouselSection'
import CtaSection from './sections/CtaSection'
import FeatureGridSection from './sections/FeatureGridSection'
import GallerySection from './sections/GallerySection'
import HeroSection from './sections/HeroSection'
import LookbookSection from './sections/LookbookSection'
import NewsletterSection from './sections/NewsletterSection'
import ProductGridSection from './sections/ProductGridSection'
import RaffleTickerSection from './sections/RaffleTickerSection'
import RichTextSection from './sections/RichTextSection'
import UspStripSection from './sections/UspStripSection'
import VideoBannerSection from './sections/VideoBannerSection'

const REGISTRY = {
  hero: HeroSection,
  carousel: CarouselSection,
  uspStrip: UspStripSection,
  lookbook: LookbookSection,
  newsletter: NewsletterSection,
  featureGrid: FeatureGridSection,
  richText: RichTextSection,
  gallery: GallerySection,
  cta: CtaSection,
  productGrid: ProductGridSection,
  auctionTicker: AuctionTickerSection,
  raffleTicker: RaffleTickerSection,
  videoBanner: VideoBannerSection,
}

// Blocks that shouldn't animate in (full-bleed / above-the-fold / chrome-like).
const NO_REVEAL = new Set(['hero', 'uspStrip', 'videoBanner'])

// Renders an ordered list of blocks ({ id, kind, isVisible, data }). Each block
// fades + lifts into view on scroll (except the hero / strips). `preview`
// forces hidden blocks to render (admin editor).
export default function SectionRenderer({ sections = [], preview = false }) {
  const visible = sections.filter((s) => preview || s.isVisible)
  return (
    <>
      {visible.map((s, i) => {
        const Component = REGISTRY[s.kind]
        if (!Component) return null
        const el = <Component key={s.id ?? `${s.kind}-${i}`} data={s.data || {}} index={i + 1} />
        if (preview || NO_REVEAL.has(s.kind)) return el
        return <Reveal key={s.id ?? `${s.kind}-${i}`}>{el}</Reveal>
      })}
    </>
  )
}
