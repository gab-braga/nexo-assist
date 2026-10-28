import { Newsreader, Schibsted_Grotesk } from "next/font/google";

export const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
});

export const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-schibsted-grotesk",
  display: "swap",
});
