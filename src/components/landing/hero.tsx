"use client";

import { motion, type Variants } from "framer-motion";
import { Mic, Plus, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAvatarPalette, getInitials } from "@/lib/room";

/** Decorative stand-ins so the cluster looks like a real room at a glance. */
const MOCK_MEMBERS = [
  { name: "Ada Lovelace", speaking: true },
  { name: "Grace Hopper", speaking: false },
  { name: "Alan Turing", speaking: false },
  { name: "Katherine Johnson", speaking: true },
  { name: "Linus Pauling", speaking: false },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.06 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

function AvatarCluster() {
  return (
    <motion.div
      aria-hidden="true"
      variants={rise}
      className="relative mx-auto grid w-full max-w-sm place-items-center"
    >
      <div className="panel relative flex w-full flex-col items-center gap-6 rounded-3xl px-6 py-10">
        <span className="absolute inset-x-8 -top-px h-px bg-linear-to-r from-transparent via-primary/50 to-transparent" />

        <div className="flex flex-wrap items-center justify-center gap-3">
          {MOCK_MEMBERS.map((member, index) => {
            const palette = getAvatarPalette(member.name);
            return (
              <motion.span
                key={member.name}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.35 + index * 0.08,
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
                className="relative grid size-12 place-items-center rounded-full text-sm font-semibold text-white sm:size-14"
                style={{
                  backgroundImage: `linear-gradient(150deg, ${palette.from} 0%, ${palette.to} 100%)`,
                }}
              >
                {getInitials(member.name)}
                {member.speaking ? (
                  <>
                    <span className="absolute inset-0 rounded-full border-2 border-primary/60 animate-vm-ripple" />
                    <span className="absolute inset-[-3px] rounded-full ring-2 ring-primary/45 animate-vm-pulse-ring" />
                  </>
                ) : null}
              </motion.span>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-full bg-background/60 px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" />
            Live
          </span>
          <span className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            {MOCK_MEMBERS.length}/5
          </span>
          <span className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1.5">
            <Mic className="size-3.5" />
            Audio only
          </span>
        </div>
      </div>
    </motion.div>
  );
}

interface HeroProps {
  onCreate: () => void;
  onJoin: () => void;
}

export function Hero({ onCreate, onJoin }: HeroProps) {
  return (
    <motion.section
      variants={container}
      initial="hidden"
      animate="show"
      className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24"
    >
      <div className="text-center lg:text-left">
        <motion.span
          variants={rise}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          <ShieldCheck aria-hidden="true" className="size-3.5 text-success" />
          Peer-to-peer &middot; no sign-up
        </motion.span>

        <motion.h1
          variants={rise}
          className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl"
        >
          Talk.{" "}
          <span className="bg-linear-to-br from-primary to-warning bg-clip-text text-transparent">
            Not type.
          </span>
        </motion.h1>

        <motion.p
          variants={rise}
          className="mx-auto mt-5 max-w-prose text-balance text-base text-muted-foreground sm:text-lg lg:mx-0"
        >
          Crystal-clear voice rooms for up to five people. Audio streams
          directly between browsers, so conversations stay fast, private, and
          effortless &mdash; open a room and start talking in seconds.
        </motion.p>

        <motion.div
          variants={rise}
          className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
        >
          <Button type="button" size="lg" onClick={onCreate}>
            <Plus aria-hidden="true" />
            Create room
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={onJoin}>
            <Users aria-hidden="true" />
            Join room
          </Button>
        </motion.div>
      </div>

      <AvatarCluster />
    </motion.section>
  );
}
