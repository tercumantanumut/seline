"use client";

import { useEffect } from "react";
import { Shell } from "@/components/layout/shell";
import { useTranslations } from "next-intl";
import { animate, createTimeline, stagger } from "animejs";
import { useAnimeScope } from "@/components/character-creation";
import { useReducedMotion } from "@/lib/animations/hooks";
import { ZLUTTY_DURATIONS, ZLUTTY_EASINGS } from "@/lib/animations/utils";
import { ExternalLinkIcon, InfoIcon } from "lucide-react";

const LINKEDIN_URL = "https://www.linkedin.com/in/umut-tan-97214b9b/";
const GITHUB_URL = "https://github.com/tercumantanumut/seline";

export default function AboutPage() {
  const t = useTranslations("about");
  const prefersReducedMotion = useReducedMotion();
  const { root, scope } = useAnimeScope();

  useEffect(() => {
    document.title = `${t("title")} — Seline`;
    return () => { document.title = "Seline"; };
  }, [t]);

  useEffect(() => {
    if (!scope.current || prefersReducedMotion) return;

    scope.current.add(() => {
      const timeline = createTimeline({
        autoplay: true,
        defaults: { ease: ZLUTTY_EASINGS.reveal },
      });

      timeline
        .add(".about-hero", {
          opacity: [0, 1],
          translateY: [24, 0],
          duration: ZLUTTY_DURATIONS.slow,
        })
        .add(
          ".about-accent",
          {
            scaleY: [0, 1],
            duration: ZLUTTY_DURATIONS.normal,
            ease: ZLUTTY_EASINGS.smooth,
          },
          "-=500"
        )
        .add(
          ".about-link",
          {
            opacity: [0, 1],
            translateY: [10, 0],
            delay: stagger(90),
            duration: ZLUTTY_DURATIONS.fast,
          },
          "-=400"
        );

      animate(".about-pulse", {
        opacity: [0.25, 0.6, 0.25],
        duration: ZLUTTY_DURATIONS.loop,
        loop: true,
        ease: ZLUTTY_EASINGS.float,
      });
    });
  }, [prefersReducedMotion, scope]);

  const heroStyle = prefersReducedMotion ? undefined : { opacity: 0 };
  const accentStyle = prefersReducedMotion ? undefined : { transform: "scaleY(0)" };
  const linkStyle = prefersReducedMotion
    ? undefined
    : { opacity: 0, transform: "translateY(10px)" };

  return (
    <Shell>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b border-terminal-border bg-terminal-cream p-4">
          <div className="flex items-center gap-3">
            <InfoIcon className="size-6 text-terminal-green" />
            <div>
              <h1 className="font-mono text-xl font-bold text-terminal-dark">{t("title")}</h1>
              <p className="font-mono text-sm text-terminal-muted">{t("subtitle")}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-terminal-cream">
          <div ref={root} className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
            <section
              className="about-hero relative overflow-hidden rounded-xl border border-terminal-border bg-terminal-cream/70 p-6 shadow-sm"
              style={heroStyle}
            >
              <div
                className="about-accent absolute left-0 top-0 h-full w-1 origin-top bg-terminal-amber/70"
                style={accentStyle}
              />
              <div className="about-pulse absolute -right-6 -top-8 h-24 w-24 rounded-full bg-terminal-amber/20 blur-2xl" />
              <div className="relative z-10 flex flex-col gap-4">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-terminal-amber/40 bg-terminal-amber/10 px-3 py-1 text-xs font-mono uppercase tracking-wide text-terminal-amber">
                  {t("releasedBadge")}
                </span>
                <p className="text-lg font-mono font-semibold text-terminal-dark">{t("headline")}</p>
                <p className="text-sm font-mono text-terminal-muted">{t("byline")}</p>
                <div className="flex flex-wrap gap-3">
                  <a
                    className="about-link inline-flex items-center gap-2 rounded-full border border-terminal-border bg-white/80 px-3 py-1.5 text-xs font-mono text-terminal-dark transition-colors hover:bg-terminal-cream hover:text-terminal-green"
                    href={LINKEDIN_URL}
                    target="_blank"
                    rel="noreferrer"
                    style={linkStyle}
                  >
                    {t("linkLinkedIn")}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                  <a
                    className="about-link inline-flex items-center gap-2 rounded-full border border-terminal-border bg-white/80 px-3 py-1.5 text-xs font-mono text-terminal-dark transition-colors hover:bg-terminal-cream hover:text-terminal-green"
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    style={linkStyle}
                  >
                    {t("linkGitHub")}
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </Shell>
  );
}
