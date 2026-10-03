import { defineMeta } from "blume";

// The release pages come from GitHub (`githubReleases()` in blume.config.ts). Blume lists them in
// the sidebar too, and can't leave them out without dropping them from the /changelog index
// (https://github.com/haydenbleasel/blume/issues/336), so fold them into one closed group.
export default defineMeta({
  title: "Changelog",
  icon: "history",
  display: "group",
  collapsed: true,
});
