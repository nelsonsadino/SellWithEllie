import SectionHead from '../SectionHead'

export default function RichTextSection({ data = {}, index }) {
  return (
    <section className="container section-block">
      {data.heading && <SectionHead index={index} title={data.heading} />}
      <div className="rich-text">
        {data.body &&
          String(data.body)
            .split('\n\n')
            .map((para, i) => <p key={i}>{para}</p>)}
      </div>
    </section>
  )
}
