'use client';

import { useState } from 'react';

export default function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [form, setForm] = useState({ name: '', email: '', message: '' });

  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyqjkeA5Ik4w6pTpB9ZbZ-J0X8R3g6Zi0MAhlkEOBWTjZ2ncFmXH6AUH2IN5dqutsDPpA/exec';

  async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setStatus('sending');
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action: 'contact',
        name: form.name,
        email: form.email,
        message: form.message,
      }).toString(),
    });
    setStatus('success');
    setForm({ name: '', email: '', message: '' });
  } catch {
    setStatus('error');
  }
}

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="pt-12 pb-8 px-8">
        <div className="flex flex-col items-center justify-center gap-4 mb-4">
          <img
            src="https://res.cloudinary.com/defdv9zw7/image/upload/v1771535143/BIRDHAUS_PNG_smaller_vlsqhf.png"
            alt="The Birdhaus logo"
            className="w-32 h-32 md:w-40 md:h-40"
          />
          <h1 className="text-4xl md:text-6xl font-bold text-center">the BIRDHAUS</h1>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6 text-sm">
          <a href="/" className="hover:underline">Upcoming Shows</a>
          <span className="hidden md:inline">•</span>
          <a href="/archive" className="hover:underline">Archive</a>
          <span className="hidden md:inline">•</span>
          <a href="/videos" className="hover:underline">Video</a>
          <span className="hidden md:inline">•</span>
          <a href="/contact" className="hover:underline font-semibold">Contact</a>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-8 pb-16">
        <h2 className="text-4xl font-bold mb-2">Contact</h2>
        <p className="text-gray-600 text-lg mb-8">
          Questions about shows, booking, or anything else — drop us a line.
        </p>

        {status === 'success' ? (
          <p className="text-lg">Got it — we'll be in touch.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Message</label>
              <textarea
                required
                rows={5}
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:border-black resize-none"
              />
            </div>
            {status === 'error' && (
              <p className="text-red-600 text-sm">Something went wrong — try emailing us directly at alex@thebirdhaus.org</p>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="border border-black rounded px-6 py-2 text-sm font-medium hover:bg-black hover:text-white transition-colors disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending...' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}