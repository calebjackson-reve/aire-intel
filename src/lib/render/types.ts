export type LayoutVariant =
  | "just_listed_cover"
  | "stat"
  | "photo_feature"
  | "quote"
  | "cta";

export interface SlideSpec {
  layoutVariant: LayoutVariant;
  eyebrow?: string;
  hero?: string;
  meta?: string;
  body?: string;
  photoSlot?: number | null;
  stat?: { value: string; label: string };
}

export interface PostSpec {
  caption: string;
  hashtags: string[];
  slides: SlideSpec[];
  motionSpec?: { slideIndex: number; moves: { name: string; delayMs: number }[] }[];
}

export interface AgentBrand {
  name: string;
  brokerage: string;
  phone?: string;
  handle?: string;
}

// Brand tokens for rendered assets (distinct from product-UI Fraunces theme).
export const BRAND = {
  black: "#0F1011",
  coral: "#EE8172",
  cream: "#EFDD84",
  white: "#F5F4F2",
  muted: "rgba(245,244,242,0.55)",
} as const;

export const CAROUSEL = { width: 1080, height: 1350 } as const;
export const STORY = { width: 1080, height: 1920 } as const;
