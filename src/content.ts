// ─────────────────────────────────────────────────────────────────────────────
//  CASE FILE – content.ts
//  Edit ONLY this file to personalise the portfolio.
// ─────────────────────────────────────────────────────────────────────────────

export const IDENTITY = {
  /** Shown in boot wordmark:  "[NAME] INTERACTIVE" */
  name: 'HAFIZ HUSSAIN',
  alias: 'The Architect',
  role: 'Front-end Developer · WebXR · UI/UX',
  location: 'Kochi',
  availability: 'Open to opportunities',

  bio: [
    'Third-year B.Tech Information Technology student at CUSAT.',
    'Crafting modern front-end experiences and immersive WebXR applications.',
    'Constantly exploring the boundaries of UI/UX and game development.',
  ],

  /** Shown in the "case file poster" on the desk scene */
  skills: [
    'TypeScript', 'React', 'Next.js', 'Three.js', 'WebXR',
    'WebAssembly', 'Rust', 'C++', 'Python', 'Godot',
  ],

  /** "Known Associates" in the case file — tools / tech */
  associates: [
    'Node.js', 'Tailwind CSS', 'Framer Motion', 'Figma',
    'A-Frame', 'MATLAB', 'Simulink'
  ],

  /** Hidden text revealed by magnifying glass in Desk scene */
  secrets: [
    '"Distinguishing marks: Pixel-perfect UI tendencies"',
    '"Last seen: Decoding bugs at 4 AM"',
    '"Known weakness: Infinite loops and unoptimized shaders"',
    '"Alias active in: Make-A-Ton & Hack Europa 2.0"',
  ],
} as const;

export const QUESTS = [
  { id: 'moon', label: 'Observe the blood moon' },
  { id: 'coffee', label: 'Fuel the investigation' },
  { id: 'folder', label: 'Review the classified dossier' },
  { id: 'payphone', label: 'Check the dead drop' }
] as const;


// ─── CONTACT ─────────────────────────────────────────────────────────────────
export const CONTACT = {
  email: 'hafiz200624@gmail.com',
  github: 'https://github.com/HafizHussain24',
  linkedin: 'https://linkedin.com/in/hafiz-hussain-265790329',
  twitter: '',
  dribbble: '',
  itch: '',
  /** Contact form endpoint — Formspree ID, Netlify, or 'mailto' */
  formEndpoint: 'https://formspree.io/f/xnpjnpvy',
} as const;

// ─── PROJECTS ────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  title: string;
  blurb: string;
  tags: string[];
  role: string;
  liveUrl?: string;
  githubUrl?: string;
  /** Path under /public, e.g. '/images/project-a.jpg' */
  image?: string;
  /** Optional position hint for board layout [0..1, 0..1] */
  boardPos?: [number, number];
  isGameProject?: boolean;
  youtubeUrl?: string;
}

export const PROJECTS: Project[] = [
  {
    id: 'proj-01',
    title: 'Kochi Metro Rail Ltd. Website',
    blurb: 'Redesigned the official corporate website from scratch, delivered in under one month for KMRL.',
    tags: ['UI/UX', 'Front-end Design', 'Web Design'],
    role: 'Frontend Developer (Team of 4)',
    liveUrl: 'https://corporate.kochimetro.org',
    youtubeUrl: 'https://youtu.be/2GbmBVTsvtI?si=YYzuZstpbU2tz1RX',
    image: '/kmrl.jpg',
    boardPos: [0.5, 0.5], // Center
  },
  {
    id: 'proj-02',
    title: 'KRISHI',
    blurb: 'Knowledge-driven Real-time Intelligent System for Harvest Improvement. Hackathon-winning MVP with OpenCV vegetation analysis and AI crop suggestions.',
    tags: ['Python', 'FastAPI', 'OpenCV', 'Hugging Face', 'Tailwind CSS'],
    role: 'Full Stack / AI Integration',
    image: '/krishi.jpg',
    boardPos: [0.2, 0.25],
  },
  {
    id: 'proj-03',
    title: 'Revive - Mental Wellness',
    blurb: 'A comprehensive dopamine detox and mental wellness app designed to help youth manage stress and reduce digital addiction.',
    tags: ['React 18', 'TypeScript', 'Tailwind', 'Framer Motion', 'Vite'],
    role: 'Frontend Developer',
    image: '/revive.jpg',
    boardPos: [0.8, 0.25],
  },
  {
    id: 'proj-04',
    title: 'A Vibrant Isle',
    blurb: 'A cozy, story-driven adventure game where you explore a mysterious grayscale island to recover the lost shards of color.',
    tags: ['Game Design', 'Story-Driven', 'Pixel Art'],
    role: 'Game Developer',
    liveUrl: 'https://orangejuice24.itch.io/vibrant-isle',
    image: '/vibrant-isle.jpg',
    boardPos: [0.2, 0.75],
    isGameProject: true,
  },
  {
    id: 'proj-05',
    title: 'Cusat Ride',
    blurb: 'An endless 3D survival riding game. Navigate the CUSAT campus, dodge stray animals, and outrun the MVD.',
    tags: ['3D', 'Web Game', 'Physics Simulation'],
    role: 'Game Developer',
    liveUrl: 'https://cusat-ride-useless.vercel.app/',
    image: '/cusat-ride.jpg',
    boardPos: [0.8, 0.75],
    isGameProject: true,
  },
  {
    id: 'proj-06',
    title: 'Top Secret Project',
    blurb: 'This file is currently redacted. Awaiting declassification in the near future. Stay tuned.',
    tags: ['COMING SOON', 'REDACTED'],
    role: 'Lead Developer',
    boardPos: [0.5, 0.82],
  },
];

// ─── WORLD CONFIG ─────────────────────────────────────────────────────────────
export const WORLD = {
  cityName: 'Neo-Kochi',
  /** Signature accent — any valid CSS colour string */
  accentColor: '#00e5ff',
  accentColorHex: 0x00e5ff,
  amberColor: 0xffb347,
  /** Boot wordmark string */
  bootWordmark: 'HAFIZ HUSSAIN INTERACTIVE',
} as const;

// ─── FUN / EASTER EGGS ───────────────────────────────────────────────────────
export const EASTER_EGGS = {
  konamiResult: 'night-vision',   // 'night-vision' | 'vaporwave' | 'glitch-storm'
  coffeeQuotes: [
    '"Coffee count today: lost track."',
    '"The best code is written at 2 AM with a full cup."',
    '"This cup has seen things. Terrible merge conflicts."',
  ],
  moonMessage: 'You found the moon. +10 detective points.',
} as const;
