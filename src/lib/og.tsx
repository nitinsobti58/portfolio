import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

type Options = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

/** Shared Open Graph card so every route renders the same way. */
export function ogImage({ title, subtitle, eyebrow }: Options) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#faf8f3",
          color: "#1a1a1a",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#6b6b6b" }}>
          {eyebrow ?? site.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 600,
              letterSpacing: -2,
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                color: "#4a4a4a",
                lineHeight: 1.3,
                maxWidth: 960,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#6b6b6b" }}>
          {site.url.replace("https://", "")}
        </div>
      </div>
    ),
    ogSize,
  );
}
