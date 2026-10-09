// Describes every storefront / marketing block kind: a label, the fields the
// generic SectionEditor renders, and the default data a freshly-added block
// starts with. Keep KINDS in sync with the server's TenantDefaults.SectionKinds.
//
// field types: 'text' | 'textarea' | 'number' | 'toggle' | 'list' | 'itemList' | 'slides'
//   list      -> array of strings
//   itemList  -> array of { title, body } objects
//   slides    -> array of { image, heading, text, buttonLabel, buttonHref }
//   toggle    -> boolean

export const SECTION_SCHEMA = {
  hero: {
    label: 'Hero',
    description: 'Big headline, blurb, and up to two call-to-action buttons.',
    fields: [
      { key: 'title', label: 'Headline', type: 'text' },
      { key: 'subtitle', label: 'Sub-headline', type: 'textarea' },
      { key: 'primaryLabel', label: 'Primary button label', type: 'text' },
      { key: 'primaryHref', label: 'Primary button link', type: 'text' },
      { key: 'secondaryLabel', label: 'Secondary button label', type: 'text' },
      { key: 'secondaryHref', label: 'Secondary button link', type: 'text' },
    ],
    defaultData: {
      title: 'A short, punchy headline',
      subtitle: 'One or two sentences about what this shop sells and why to look.',
      primaryLabel: 'Shop now',
      primaryHref: '/products',
      secondaryLabel: '',
      secondaryHref: '',
    },
  },

  featureGrid: {
    label: 'Feature grid',
    description: 'A heading plus a row of short titled points.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'items', label: 'Points', type: 'itemList' },
    ],
    defaultData: {
      heading: 'Why shop with us',
      items: [
        { title: 'Point one', body: 'A sentence backing it up.' },
        { title: 'Point two', body: 'A sentence backing it up.' },
        { title: 'Point three', body: 'A sentence backing it up.' },
      ],
    },
  },

  richText: {
    label: 'Text block',
    description: 'A heading and a paragraph of prose.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ],
    defaultData: { heading: 'A section heading', body: 'Write anything you like here.' },
  },

  gallery: {
    label: 'Image gallery',
    description: 'A grid of images by URL.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'images', label: 'Image URLs', type: 'list' },
    ],
    defaultData: { heading: '', images: [] },
  },

  cta: {
    label: 'Call to action',
    description: 'A centred prompt with one button.',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'buttonLabel', label: 'Button label', type: 'text' },
      { key: 'buttonHref', label: 'Button link', type: 'text' },
    ],
    defaultData: {
      title: 'Ready to get started?',
      body: '',
      buttonLabel: 'Browse the shop',
      buttonHref: '/products',
    },
  },

  productGrid: {
    label: 'Product grid (live)',
    description: 'Pulls real products from this shop.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'limit', label: 'How many to show', type: 'number' },
      { key: 'sort', label: 'Sort (newest / price_asc / price_desc / name)', type: 'text' },
    ],
    defaultData: { heading: 'Newly listed', limit: 4, sort: 'newest' },
  },

  auctionTicker: {
    label: 'Auction ticker (live)',
    description: 'The scrolling strip of live auction prices and countdowns.',
    fields: [{ key: 'heading', label: 'Heading (optional)', type: 'text' }],
    defaultData: { heading: '' },
  },

  raffleTicker: {
    label: 'Raffle ticker (live)',
    description: 'The scrolling strip of open raffles, seats left, and prices.',
    fields: [{ key: 'heading', label: 'Heading (optional)', type: 'text' }],
    defaultData: { heading: '' },
  },

  uspStrip: {
    label: 'Info strip',
    description: 'A slim row of short reassurances - free returns, secure checkout, delivery time.',
    fields: [{ key: 'items', label: 'Points (title = bold, body = detail)', type: 'itemList' }],
    defaultData: {
      items: [
        { title: 'Free returns', body: 'within 30 days' },
        { title: 'Secure checkout', body: 'protected end to end' },
        { title: 'Ships in 2 days', body: 'from our workshop' },
      ],
    },
  },

  lookbook: {
    label: 'Feature (image + text)',
    description: 'A large image beside a heading, paragraph and button. Good for storytelling.',
    fields: [
      { key: 'image', label: 'Image URL', type: 'text' },
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'buttonLabel', label: 'Button label', type: 'text' },
      { key: 'buttonHref', label: 'Button link', type: 'text' },
      { key: 'flip', label: 'Put image on the right', type: 'toggle' },
    ],
    defaultData: {
      image: '',
      heading: 'Made to last',
      body: 'A short story about the shop, the maker, or how a product comes together.',
      buttonLabel: 'Read more',
      buttonHref: '/about',
      flip: false,
    },
  },

  newsletter: {
    label: 'Newsletter signup',
    description: 'A centred email capture. Submissions show a thank-you (wire to your mailing list later).',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'placeholder', label: 'Input placeholder', type: 'text' },
      { key: 'buttonLabel', label: 'Button label', type: 'text' },
    ],
    defaultData: {
      heading: 'Get first look',
      body: 'New arrivals and restocks, straight to your inbox. No spam.',
      placeholder: 'you@email.com',
      buttonLabel: 'Subscribe',
    },
  },

  videoBanner: {
    label: 'Video banner',
    description:
      'A full-width autoplaying video with optional heading, text and a button over it. Upload your own clip (mp4 or webm) or paste a URL. Muted and looping; visitors who prefer reduced motion see the poster image instead.',
    fields: [
      { key: 'videoUrl', label: 'Video (mp4 / webm)', type: 'video' },
      { key: 'posterUrl', label: 'Poster image URL (shown while loading / reduced motion)', type: 'text' },
      { key: 'heading', label: 'Heading (optional)', type: 'text' },
      { key: 'text', label: 'Text (optional)', type: 'textarea' },
      { key: 'buttonLabel', label: 'Button label (optional)', type: 'text' },
      { key: 'buttonHref', label: 'Button link', type: 'text' },
      { key: 'height', label: 'Height (short / tall / full)', type: 'text' },
      { key: 'overlay', label: 'Dark overlay strength 0-80 (for readable text)', type: 'number' },
    ],
    defaultData: {
      videoUrl: '',
      posterUrl: '',
      heading: '',
      text: '',
      buttonLabel: '',
      buttonHref: '/products',
      height: 'tall',
      overlay: 35,
    },
  },

  carousel: {
    label: 'Carousel',
    description: 'A rotating banner of slides - image, heading, text and an optional button per slide.',
    fields: [
      { key: 'autoplay', label: 'Auto-advance every N seconds (0 = off)', type: 'number' },
      { key: 'slides', label: 'Slides', type: 'slides' },
    ],
    defaultData: {
      autoplay: 6,
      slides: [
        {
          image: '',
          heading: 'New season, new arrivals',
          text: 'Fresh picks added every week.',
          buttonLabel: 'Shop new in',
          buttonHref: '/products',
        },
        {
          image: '',
          heading: 'Bidding is live',
          text: 'Catch a lot before it closes.',
          buttonLabel: 'View auctions',
          buttonHref: '/auctions',
        },
      ],
    },
  },
}

export const KINDS = Object.keys(SECTION_SCHEMA)

export function schemaFor(kind) {
  return SECTION_SCHEMA[kind] || { label: kind, fields: [], defaultData: {} }
}

export function defaultDataFor(kind) {
  return structuredClone(schemaFor(kind).defaultData || {})
}
