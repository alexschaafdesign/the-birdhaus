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
    <main className="min-h-screen">
      <div className="max-w-xl mx-auto px-8 pb-16">
        <h2 className="text-4xl font-bold mb-2">Contact</h2>
        <p className="text-[#E8E0D0]/70 text-lg mb-6">
          Questions about shows, booking, or anything else — drop us a line.
        </p>

        <div className="border border-[#E8E0D0]/30 rounded-lg p-4 mb-8 bg-[#E8E0D0]/5">
          <p className="text-sm">
            <span className="font-semibold">Heads up:</span> the BIRDHAUS will be closed for shows from October through December 2026.
          </p>
        </div>

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
                className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Message</label>
              <textarea
                required
                rows={5}
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0] resize-none"
              />
            </div>
            {status === 'error' && (
              <p className="text-red-400 text-sm">Something went wrong — try emailing us directly at alex@thebirdhaus.org</p>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending...' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}