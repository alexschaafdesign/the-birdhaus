export type HeroImage = {
  src: string;
  alt: string;
  credit: string;
};

export const heroImages: HeroImage[] = [
  {
    src: 'https://res.cloudinary.com/defdv9zw7/image/upload/v1771535212/IMG_7246_vdubka.jpg',
    alt: 'Mary Jam',
    credit: 'Mary Jam on 1/23/26 - Photo by Sabrina Rose',
  },
  {
    src: 'https://images.thebirdhaus.org/misc/2016-01-16%20by%20Jeremy%20Nelson%205.jpg',
    alt: 'Venue',
    credit: 'Photo by Jeremy Nelson',
  },
  {
    src: 'https://images.thebirdhaus.org/misc/2026_06_26%20-%20GHOSTING%20MERIT-3.png',
    alt: 'Ghosting Merit',
    credit: 'Ghosting Merit on 6/26/26 - Photo by Kristiana Tu',
  },
  {
    src: 'https://images.thebirdhaus.org/misc/dosh%20%26%20jt%20bates_Juliet%20Farmer-19%20(1).jpg',
    alt: 'Dosh + JT Bates',
    credit: 'Photo by Juliet Farmer',
  },
  {
    src: 'https://images.thebirdhaus.org/misc/birdhaus_juliet%20farmer-13%20(1).jpg',
    alt: 'The Birdhaus venue',
    credit: 'Photo by Juliet Farmer',
  },
  {
    src: 'https://images.thebirdhaus.org/misc/birdhaus_juliet%20farmer-21%20(1).jpg',
    alt: 'The Birdhaus venue',
    credit: 'Photo by Juliet Farmer',
  },
];

/**
 * Returns a random subset of `count` hero images with no repeats,
 * capped at the total number of available images.
 */
export function getRandomHeroImages(count: number): HeroImage[] {
  const shuffled = [...heroImages].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, heroImages.length));
}
