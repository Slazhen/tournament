import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="glass rounded-xl p-8 max-w-md w-full text-center">
        <h1 className="text-xl font-semibold mb-4">404 - Page Not Found</h1>
        <p className="opacity-80 mb-6">The page you're looking for doesn't exist.</p>
        <p className="text-sm opacity-60 mb-4">
          Current URL: {window.location.href}
        </p>
        <Link to="/" className="px-6 py-3 rounded-lg glass hover:bg-white/10 transition-all">
          Go to Home
        </Link>
      </div>
    </div>
  )
}
