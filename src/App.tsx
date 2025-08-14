import { Link, Outlet } from 'react-router-dom'

function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 glass">
        <div className="mx-auto container-max px-4 py-4 flex items-center gap-4">
          <div className="font-semibold tracking-wider text-base">F Tables</div>
          <nav className="ml-auto flex items-center gap-4 text-[0.95rem]">
            <Link to="/" className="opacity-90 hover:opacity-100">Home</Link>
            <Link to="/tournaments" className="opacity-90 hover:opacity-100">Tournaments</Link>
            <Link to="/teams" className="opacity-90 hover:opacity-100">Teams</Link>
            <Link to="/calendar" className="opacity-90 hover:opacity-100">Calendar</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto container-max px-4 py-10">
        <div className="w-full flex items-start justify-center">
          <div className="w-full max-w-3xl">
            <Outlet />
          </div>
        </div>
      </main>
      <footer className="mx-auto container-max px-4 py-10 text-xs opacity-70 text-center">
        Local-first. Export to GitHub Pages when ready.
      </footer>
    </div>
  )
}

export default App
