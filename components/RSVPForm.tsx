'use client';

import { useState } from 'react';

export default function RSVPForm({ showTitle }: { showTitle: string }) {
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
      const response = await fetch('https://script.google.com/macros/s/AKfycbwlKLbNE4IaAvx61hJ25K0c9QxPVJdt87P65EtnHuCl2AvCdvkJCBMdgh_IagfqwtEzEA/exec', {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          show: showTitle,
          name: formData.name,
          email: formData.email,
          guests: formData.guests,
          emailList: formData.emailList,
        }),
      });

      setStatus('success');
      setFormData({ name: '', email: '', guests: '1', emailList: false });
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <div className="border border-gray-800 rounded-lg p-8 mb-12">
      <h2 className="text-3xl font-bold mb-6">RSVP for this show</h2>
      <p className="text-gray-400 mb-6">The exact address for the Birdhaus will be emailed to all RSVPs as we get closer to the show.</p>

      
      {status === 'success' ? (
        <div className="bg-green-900/20 border border-green-800 rounded p-4 text-green-400">
          Thanks for your RSVP! See you there.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:border-gray-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:border-gray-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="guests" className="block text-sm font-medium mb-2">
              Number of guests (including you)
            </label>
            <select
              id="guests"
              value={formData.guests}
              onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
              className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:border-gray-500 focus:outline-none"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5+</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="emailList"
              checked={formData.emailList}
              onChange={(e) => setFormData({ ...formData, emailList: e.target.checked })}
              className="w-4 h-4 rounded border-gray-700 bg-black"
            />
            <label htmlFor="emailList" className="ml-2 text-sm">
              Add me to the email list for future shows
            </label>
          </div>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full bg-white text-black font-bold py-3 px-6 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'submitting' ? 'Submitting...' : 'Submit RSVP'}
          </button>

          {status === 'error' && (
            <div className="bg-red-900/20 border border-red-800 rounded p-4 text-red-400">
              Something went wrong. Please try again.
            </div>
          )}
        </form>
      )}
    </div>
  );
}