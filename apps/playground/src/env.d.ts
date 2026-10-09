/// <reference types="vite/client" />

/** Set in vite.config.ts: whether the dev server's interaction relay can deliver to your app. */
declare const __RELAY__: "ready" | "unconfigured" | "absent";
