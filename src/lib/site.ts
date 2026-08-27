/** Single source of truth for site-wide metadata. Used by metadataBase, OG tags, sitemap, and the header. */
export const site = {
  name: "Nitin Sobti",
  url: "https://nitinsobti.com",
  title: "Nitin Sobti — Software, Finance, Markets",
  description:
    "Portfolio of Nitin Sobti, a computer science student building software at the intersection of finance and technology.",
  author: {
    name: "Nitin Sobti",
    email: "nitinsobti58@gmail.com",
    github: "https://github.com/nitinsobti58",
    // TODO: replace with the real profile URL.
    linkedin: "https://www.linkedin.com/",
  },
  resumePath: "/resume.pdf",
} as const;

export type Site = typeof site;
