import { redirect } from 'next/navigation';

// The old standalone video list is now folded into the video-forward /archive,
// where every set is grouped under the show it came from.
export default function VideosPage() {
  redirect('/archive');
}
