// Lets keyboard and screen-reader users jump past the header straight to the
// page content. Targets <main id="main"> in each app shell.
export default function SkipLink() {
  return (
    <a href="#main" className="skip-link">
      Skip to content
    </a>
  )
}
