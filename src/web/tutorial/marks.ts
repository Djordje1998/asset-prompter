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
    { x: 39.1, y: 32.4, w: 1.9, h: 3.6 },
    { x: 17.3, y: 40.1, w: 24.6, h: 3.4 },
  ],
  agent: [
    { x: 55.2, y: 85.5, w: 15.6, h: 6 },
    { x: 34.8, y: 1.8, w: 22.3, h: 6 },
    { x: 82.6, y: 14.7, w: 8, h: 5 },
  ],
  feed: [
    { x: 5.8, y: 13.8, w: 9.5, h: 5.2 },
    { x: 3, y: 23, w: 70.5, h: 6 },
    { x: 30.3, y: 38.5, w: 11.7, h: 3.9 },
    { x: 73.8, y: 38.3, w: 23, h: 4.2 },
  ],
  generate: [
    { x: 46.7, y: 29.6, w: 50.1, h: 6.6 },
    { x: 47.5, y: 52.3, w: 11.5, h: 6 },
    { x: 46.6, y: 66.9, w: 24.8, h: 9.6 },
    { x: 6.7, y: 37.3, w: 34.8, h: 30.2 },
  ],
  notify: [
    { x: 3.1, y: 41.7, w: 41.9, h: 58.3 },
    { x: 30.8, y: 25.7, w: 9, h: 3.9 },
    { x: 82.2, y: 10.2, w: 14.9, h: 6 },
  ],
  review: [
    { x: 46.6, y: 29.1, w: 39, h: 24.2 },
    { x: 4.1, y: 84.6, w: 17.6, h: 14.2 },
    { x: 46.6, y: 77.6, w: 10.4, h: 6 },
  ],
  changes: [
    { x: 46.6, y: 53.8, w: 50.3, h: 14.6 },
    { x: 1.8, y: 87.6, w: 96.4, h: 8.5 },
  ],
  lightbox: [
    { x: 32.5, y: 72.4, w: 35.1, h: 10.7 },
    { x: 60.5, y: 91.2, w: 7.6, h: 6 },
    { x: 71.8, y: 91.2, w: 6.7, h: 6 },
  ],
  done: [
    { x: 26.2, y: 25.1, w: 23.1, h: 43.6 },
    { x: 75.9, y: 26.7, w: 3.4, h: 4.3 },
    { x: 95.2, y: 26.7, w: 2.4, h: 5 },
    { x: 90.9, y: 62.6, w: 6.5, h: 4.6 },
  ],
} satisfies Record<string, Mark[]>;
