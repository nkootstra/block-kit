import type { ComponentType } from "react";
import type { BlockProps } from "../types";
import { Actions } from "./Actions";
import { Alert } from "./Alert";
import { Callout } from "./Callout";
import { Card } from "./Card";
import { Carousel } from "./Carousel";
import { Condition } from "./Condition";
import { ContactCard } from "./ContactCard";
import { Container } from "./Container";
import { Context } from "./Context";
import { ContextActions } from "./ContextActions";
import { DataTable } from "./DataTable";
import { DataVisualization } from "./DataVisualization";
import { Divider } from "./Divider";
import { FallbackCanary } from "./FallbackCanary";
import { File } from "./File";
import { Header } from "./Header";
import { Image } from "./Image";
import { Input } from "./Input";
import { Markdown } from "./Markdown";
import { Plan } from "./Plan";
import { RichText } from "./RichText";
import { Section } from "./Section";
import { Table } from "./Table";
import { TaskCard } from "./TaskCard";
import { Video } from "./Video";

// `any`: each component narrows the block itself.
export const blockComponents: Record<string, ComponentType<BlockProps<any>>> = {
  actions: Actions,
  alert: Alert,
  callout: Callout,
  card: Card,
  carousel: Carousel,
  condition: Condition,
  contact_card: ContactCard,
  container: Container,
  context: Context,
  context_actions: ContextActions,
  data_table: DataTable,
  data_visualization: DataVisualization,
  divider: Divider,
  fallback_canary: FallbackCanary,
  file: File,
  header: Header,
  image: Image,
  input: Input,
  markdown: Markdown,
  plan: Plan,
  rich_text: RichText,
  section: Section,
  table: Table,
  task_card: TaskCard,
  video: Video,
};
