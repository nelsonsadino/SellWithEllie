import SectionHead from '../SectionHead'

export default function GallerySection({ data = {}, index }) {
  const images = Array.isArray(data.images) ? data.images.filter(Boolean) : []
  if (images.length === 0) return null
  return (
    <section className="container section-block">
      {data.heading && <SectionHead index={index} title={data.heading} />}
      <div className="gallery-grid">
        {images.map((src, i) => (
          <img key={i} src={src} alt="" loading="lazy" />
        ))}
      </div>
    </section>
  )
}
