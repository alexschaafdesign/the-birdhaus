'use client';

import { useState } from 'react';

export default function RSVPForm({ 
  showTitle, 
  showDate,
  doorsTime,
  showTime,
  flyerUrl,
  ticketUrl
}: { 
  showTitle: string;
  showDate: string;
  doorsTime?: string;
  showTime?: string;
  flyerUrl?: string;
  ticketUrl?: string;
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    guests: '1',
    emailList: false,
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');

    try {
      const response = await fetch('https://script.google.com/macros/s/AKfycbyqjkeA5Ik4w6pTpB9ZbZ-J0X8R3g6Zi0MAhlkEOBWTjZ2ncFmXH6AUH2IN5dqutsDPpA/exec', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          show: showTitle,
          date: showDate,
          doorsTime: doorsTime || '',
          showTime: showTime || '',
          flyerUrl: flyerUrl || '',
          name: formData.name,
          email: formData.email,
          guests: formData.guests,
          emailList: formData.emailList.toString(),
        }).toString(),
      });

      setStatus('success');
      setFormData({ name: '', email: '', guests: '1', emailList: false });
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <div className="border-2 border-gray-200 rounded-lg p-8 mb-12 bg-gray-50">
      <h2 className="text-3xl font-bold mb-2">RSVP for this show</h2>
      <p className="text-gray-600 mb-6">
        RSVP below to get the venue address and show details emailed to you.
        {ticketUrl && (
          <> After submitting, you'll have the option to <strong>buy an advance ticket</strong> to guarantee your spot.</>
        )}
      </p>

      {status === 'success' ? (
        <div className="space-y-4">
          <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4 text-green-800">
            Thanks for your RSVP! Check your email for the full details.
          </div>
          {ticketUrl && (
            <div className="bg-black text-white rounded-lg p-6">
              <p className="text-lg font-bold mb-1">🎟 Want to guarantee your spot?</p>
              <p className="text-gray-300 text-sm mb-5">
                RSVPs are first-come, first-served and the venue is small. Buying an advance ticket means you're in — no matter how packed it gets.
              </p>
              <a
                href={ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-white text-black font-bold py-3 px-6 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Buy a Ticket →
              </a>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2 text-gray-700">
              Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-black focus:border-black focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2 text-gray-700">
              Email
            </label>
            <input
              type="email"
              id="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-black focus:border-black focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="guests" className="block text-sm font-medium mb-2 text-gray-700">
              Number of guests (including you)
            </label>
            <select
              id="guests"
              value={formData.guests}
              onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
              className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-black focus:border-black focus:outline-none transition-colors"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5+</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="emailList"
              checked={formData.emailList}
              onChange={(e) => setFormData({ ...formData, emailList: e.target.checked })}
              className="w-5 h-5 rounded border-2 border-gray-300 text-black focus:ring-black"
            />
            <label htmlFor="emailList" className="text-sm text-gray-700">
              Add me to the email list for future shows
            </label>
          </div>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full bg-black text-white font-bold py-4 px-6 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'submitting' ? 'Submitting...' : 'Submit RSVP'}
          </button>

          {status === 'error' && (
            <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 text-red-800">
              Something went wrong. Please try again.
            </div>
          )}
        </form>
      )}
    </div>
  );
}