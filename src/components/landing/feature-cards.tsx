"use client";

import { motion, type Variants } from "framer-motion";
import {
  Radio,
  ScanFace,
  ShieldOff,
  Users,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Radio,
    title: "Peer-to-peer audio",
    description:
      "Voice travels straight between browsers over WebRTC. Fewer hops means lower latency and no server listening in.",
  },
  {
    icon: Users,
    title: "Up to 5 participants",
    description:
      "A deliberate cap that keeps every mesh connection strong and every conversation small enough to actually follow.",
  },
  {
    icon: Waves,
    title: "Speaking detection",
    description:
      "Live voice activity analysis rings the avatar of whoever is talking, so you always know who has the floor.",
  },
  {
    icon: ScanFace,
    title: "Language monitoring",
    description:
      "Optional on-device speech recognition flags offensive language without any audio ever leaving your machine.",
  },
  {
    icon: Zap,
    title: "Instant rooms",
    description:
      "One click produces a readable room ID you can say out loud. Share it and people are in within seconds.",
  },
  {
    icon: ShieldOff,
    title: "No sign-up",
    description:
      "No accounts, no downloads, no tracking. Pick a display name, join the room, and close the tab when you are done.",
  },
];

const grid: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

export function FeatureCards() {
  return (
    <section
      aria-labelledby="features-heading"
      className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24"
    >
      <h2
        id="features-heading"
        className="text-balance text-center text-3xl font-semibold tracking-tight sm:text-4xl"
      >
        Everything a voice room needs. Nothing it doesn&rsquo;t.
      </h2>

      <motion.ul
        role="list"
        variants={grid}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {FEATURES.map((feature) => (
          <motion.li
            key={feature.title}
            variants={card}
            whileHover={{ y: -6 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className="panel flex flex-col gap-3 rounded-2xl p-6"
          >
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-xl bg-primary/12 text-primary"
            >
              <feature.icon className="size-5" />
            </span>
            <h3 className="text-base font-semibold">{feature.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {feature.description}
            </p>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
