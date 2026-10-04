/**
 * The page's Open Graph image, rendered by OG Kit (ogkit.dev) from the `<template data-og-template>`
 * in index.astro. OG Kit caches an image per URL forever, so `ogv` carries the cache version: bump
 * `OGKIT_CACHE_VERSION` after editing the template and every card is rendered again.
 * `ogkit-render=1` marks OG Kit's own fetch of the page.
 */
export function ogkitImageUrl(
  page: URL,
  { key, version = "v1" }: { key?: string | undefined; version?: string | undefined },
): string | null {
  // Without a key (local builds, pull requests) the page keeps its static image.
  if (!key) return null;
  const url = new URL(page);
  url.searchParams.set("ogv", version || "v1");
  url.searchParams.set("ogkit-render", "1");
  return `https://ogkit.dev/img/${key}.jpeg?url=${encodeURIComponent(url.toString())}`;
}

/** The card's subline: the description up to its first sentence end that fits, never mid-clause. */
export function subline(description: string, max = 130): string {
  if (description.length <= max) return description;
  const sentences = description.match(/[^.!?]+[.!?]+/g) ?? [];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).trim().length > max) break;
    out += sentence;
  }
  return out.trim() || description.slice(0, description.lastIndexOf(" ", max)).trim();
}
