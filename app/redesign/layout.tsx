import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './broadcast.css';

// Space Grotesk Bold — used only for the rare chroma-split display treatments.
// CommitMono (--font-commit-mono; @font-face in commit-mono.css, imported
// globally) is everything else — broadcast.css's --bx-mono points at it too.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-grotesk',
});

export const metadata: Metadata = {
  title: 'Signal — the BIRDHAUS',
  description:
    'What is playing next in the basement. A DIY house venue and record label in Powderhorn, Minneapolis — every show recorded and filmed.',
};

export default function RedesignLayout({ children }: { children: React.ReactNode }) {
  return <div className={spaceGrotesk.variable}>{children}</div>;
}
