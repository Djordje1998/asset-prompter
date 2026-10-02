/** A part of a tutorial screenshot to point at: left, top, width and height in percent of the picture. */
export interface Mark {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Measured in the browser when the screenshots were taken. Retake a screenshot and its marks together.
export const MARKS = {
  projects: [
    { x: 16.8, y: 1.6, w: 16.9, h: 6.3 },
    { x: 17.3, y: 30.7, w: 24.6, h: 6.8 },
    { x: 17.3, y: 38.3, w: 24.6, h: 7 },
  ],
  agent: [
    { x: 55.2, y: 81.2, w: 15.6, h: 6 },
    { x: 34.8, y: 1.8, w: 22.3, h: 6 },
    { x: 89.5, y: 1.8, w: 8.8, h: 6 },
  ],
  feed: [
    { x: 1.7, y: 12.5, w: 24.4, h: 6.7 },
    { x: 1.7, y: 22.5, w: 70.5, h: 6 },
    { x: 5.8, y: 33.5, w: 11.7, h: 3.9 },
    { x: 74.2, y: 33.4, w: 23, h: 4.2 },
  ],
  generate: [
    { x: 46.7, y: 29.2, w: 50.1, h: 6.2 },
    { x: 47.5, y: 51.6, w: 11.5, h: 6 },
    { x: 46.6, y: 61.3, w: 23.7, h: 13.2 },
    { x: 3.1, y: 29.1, w: 41.9, h: 41.8 },
  ],
  notify: [
    { x: 3.2, y: 39.2, w: 41.7, h: 60.1 },
    { x: 6.2, y: 23, w: 9, h: 3.9 },
    { x: 83.4, y: 11.3, w: 14.9, h: 6 },
  ],
  review: [
    { x: 41.2, y: 24.5, w: 39, h: 24.2 },
    { x: 2.9, y: 67.3, w: 37.2, h: 22.9 },
    { x: 41.2, y: 64.3, w: 10.4, h: 6 },
  ],
  changes: [
    { x: 46.6, y: 54.7, w: 50.3, h: 14.6 },
    { x: 1.8, y: 88.8, w: 96.4, h: 8.5 },
  ],
  lightbox: [
    { x: 32.5, y: 72.4, w: 35.1, h: 14.3 },
    { x: 60.5, y: 91.2, w: 7.6, h: 6 },
    { x: 68.8, y: 91.2, w: 10.7, h: 6 },
  ],
  done: [
    { x: 67.1, y: 22.7, w: 31.1, h: 36.7 },
    { x: 67.8, y: 24.1, w: 3.4, h: 4.3 },
    { x: 95.2, y: 24.1, w: 2.4, h: 5 },
    { x: 90.9, y: 61, w: 6.5, h: 4.6 },
  ],
} satisfies Record<string, Mark[]>;
