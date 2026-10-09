import type { DirectoryEntry, Resolvers, UserProfile } from "@nkootstra/block-kit";

/**
 * A sample workspace, so users, conversations and channels selects list people and channels the way
 * Block Kit Builder lists the signed-in workspace's, and mentions show names. The ids match the
 * docs' examples, so a payload copied from the docs resolves here too.
 */
const AVATARS = "https://api.slack.com/img/blocks/bkb_template_images";

const PROFILES: Record<string, UserProfile> = {
  U0ADA: {
    name: "Ada Lovelace",
    title: "Staff Engineer",
    pronouns: "she/her",
    avatarUrl: `${AVATARS}/beagle.png`,
    status: { emoji: "palm_tree", text: "On vacation" },
    timeZone: "Europe/Amsterdam",
  },
  U0GRACE: {
    name: "Grace Hopper",
    title: "Engineering Manager",
    avatarUrl: `${AVATARS}/profile_1.png`,
    timeZone: "America/New_York",
  },
  U0ALAN: {
    name: "Alan Turing",
    realName: "Alan Mathison Turing",
    title: "Principal Engineer",
    avatarUrl: `${AVATARS}/profile_2.png`,
    timeZone: "Europe/London",
  },
  U0KATHERINE: {
    name: "Katherine Johnson",
    title: "Data Scientist",
    avatarUrl: `${AVATARS}/profile_3.png`,
    timeZone: "America/Chicago",
  },
  U0MARGARET: {
    name: "Margaret Hamilton",
    title: "Head of Platform",
    avatarUrl: `${AVATARS}/profile_4.png`,
    timeZone: "America/Los_Angeles",
  },
  U0DEPLOYBOT: {
    name: "Deploy Bot",
  },
};

const CHANNELS: Record<string, string> = {
  C0GENERAL: "general",
  C0RELEASES: "releases",
  C0INCIDENTS: "incidents",
  C0SUPPORT: "support",
  C0DESIGN: "design",
  C0LEADERSHIP: "leadership",
};

const PRIVATE_CHANNELS = new Set(["C0DESIGN", "C0LEADERSHIP"]);

/** Who's online, and which member is an app's bot user, for the rows' presence icon and badge. */
const ACTIVE = new Set(["U0ADA", "U0ALAN", "U0KATHERINE", "U0DEPLOYBOT"]);
const BOTS = new Set(["U0DEPLOYBOT"]);

const PEOPLE: DirectoryEntry[] = Object.entries(PROFILES).map(([id, profile]) => ({
  type: "user",
  id,
  name: profile.name,
  realName: profile.realName,
  avatarUrl: profile.avatarUrl,
  self: id === "U0ADA",
  ...(BOTS.has(id) ? { badge: "APP", bot: true } : {}),
  ...(ACTIVE.has(id) ? { presence: "active" as const } : {}),
}));

const ROOMS: DirectoryEntry[] = Object.entries(CHANNELS).map(([id, name]) => ({
  type: "channel",
  id,
  name,
  private: PRIVATE_CHANNELS.has(id),
}));

const USERGROUPS: Record<string, string> = { S0ENG: "engineering", S0ONCALL: "on-call" };

export const sampleResolvers: Resolvers = {
  user: (id) => PROFILES[id]?.name,
  userProfile: (id) => PROFILES[id],
  channel: (id) => CHANNELS[id],
  usergroup: (id) => USERGROUPS[id],
  // The select filters these by what's typed. A channels select lists public channels only.
  directory: (source) =>
    source === "users"
      ? PEOPLE
      : source === "channels"
        ? ROOMS.filter((room) => room.type === "channel" && !room.private)
        : [...ROOMS, ...PEOPLE],
};

/** The viewer, as the sample workspace's Ada: Slack marks their own row "(you)". */
export const sampleIdentity = { user: { id: "U0ADA" } };
