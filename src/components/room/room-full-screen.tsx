"use client";

import { motion } from "framer-motion";
import { AlertCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RoomFullScreenProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function RoomFullScreen({
  title,
  description,
  icon: Icon = AlertCircle,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: RoomFullScreenProps) {
  const showPrimary = actionLabel !== undefined && onAction !== undefined;
  const showSecondary =
    secondaryLabel !== undefined && onSecondary !== undefined;

  return (
    <main className="studio-bg grid min-h-dvh place-items-center px-4 py-12">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="panel-raised w-full max-w-md rounded-2xl px-6 py-10 text-center sm:px-10"
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.35, ease: "easeOut" }}
          aria-hidden="true"
          className="mx-auto grid size-20 place-items-center rounded-full bg-primary/12 text-primary"
        >
          <Icon className="size-9" />
        </motion.div>

        <h1 className="mt-6 text-balance text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-balance text-sm text-muted-foreground">
          {description}
        </p>

        {showPrimary || showSecondary ? (
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {showPrimary ? (
              <Button type="button" size="lg" onClick={onAction}>
                {actionLabel}
              </Button>
            ) : null}
            {showSecondary ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={onSecondary}
              >
                {secondaryLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </motion.section>
    </main>
  );
}
