import type { ComponentType } from "react";
import type { BlockProps } from "../types";

// `any`: each component narrows the block itself.
export const blockComponents: Record<string, ComponentType<BlockProps<any>>> = {};
