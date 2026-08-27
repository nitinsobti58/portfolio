/** Single source of truth for site-wide metadata. Used by metadataBase, OG tags, sitemap, and the header. */
export const site = {
  name: "Nitin Sobti",
  url: "https://nitinsobti.com",
  description:
    "Portfolio of Nitin Sobti — computer science student building at the intersection of finance and software.",
  author: {
    name: "Nitin Sobti",
    email: "nitinsobti58@gmail.com",
    github: "https://github.com/nitinsobti58",
  },
} as const;

export type Site = typeof site;
