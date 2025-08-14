import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="grid place-items-center">
      <section className="glass rounded-xl p-8 w-full text-center">
        <h1 className="text-3xl font-semibold mb-4 tracking-wide">Football Tournaments</h1>
        <p className="opacity-80 mb-6 max-w-2xl mx-auto">
          Create leagues of different sizes, auto-generate fixtures, track results, and see team pages. Local-first, one-click publish to GitHub Pages.
        </p>
        <div className="flex gap-3 justify-center">
          <Link to="/tournaments" className="px-5 py-2.5 rounded-md glass">New Tournament</Link>
          <Link to="/teams" className="px-5 py-2.5 rounded-md glass">Manage Teams</Link>
        </div>
      </section>
    </div>
  )
}

