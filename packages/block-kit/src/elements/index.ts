import type { ComponentType } from "react";
import type { ElementProps } from "../types";
import { ImageElement } from "./ImageElement";

export const elementComponents: Record<string, ComponentType<ElementProps<any>>> = {
  image: ImageElement,
};
