export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-6xl font-bold mb-4">The Birdhaus</h1>
        <p className="text-xl text-gray-400 mb-8">
          A basement music venue
        </p>
        
        <div className="space-y-4">
          <a href="/shows" className="block text-2xl hover:text-gray-400">
            Upcoming Shows →
          </a>
          <a href="/archive" className="block text-2xl hover:text-gray-400">
            Archive →
          </a>
        </div>
      </div>
    </main>
  );
}