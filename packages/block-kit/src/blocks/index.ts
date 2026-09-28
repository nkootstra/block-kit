import type { ComponentType } from "react";
import type { BlockProps } from "../types";
import { Context } from "./Context";
import { Divider } from "./Divider";
import { FallbackCanary } from "./FallbackCanary";
import { File } from "./File";
import { Header } from "./Header";
import { Image } from "./Image";
import { Markdown } from "./Markdown";
import { RichText } from "./RichText";
import { Section } from "./Section";
import { Video } from "./Video";

// `any`: each component narrows the block itself.
export const blockComponents: Record<string, ComponentType<BlockProps<any>>> = {
  context: Context,
  divider: Divider,
  fallback_canary: FallbackCanary,
  file: File,
  header: Header,
  image: Image,
  markdown: Markdown,
  rich_text: RichText,
  section: Section,
  video: Video,
};
