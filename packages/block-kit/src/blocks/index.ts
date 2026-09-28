import type { ComponentType } from "react";
import type { BlockProps } from "../types";
import { Actions } from "./Actions";
import { Context } from "./Context";
import { ContextActions } from "./ContextActions";
import { Divider } from "./Divider";
import { FallbackCanary } from "./FallbackCanary";
import { File } from "./File";
import { Header } from "./Header";
import { Image } from "./Image";
import { Input } from "./Input";
import { Markdown } from "./Markdown";
import { RichText } from "./RichText";
import { Section } from "./Section";
import { Video } from "./Video";

// `any`: each component narrows the block itself.
export const blockComponents: Record<string, ComponentType<BlockProps<any>>> = {
  actions: Actions,
  context: Context,
  context_actions: ContextActions,
  divider: Divider,
  fallback_canary: FallbackCanary,
  file: File,
  header: Header,
  image: Image,
  input: Input,
  markdown: Markdown,
  rich_text: RichText,
  section: Section,
  video: Video,
};
