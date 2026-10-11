// The `@nkootstra/block-kit/transport` entry. Browser-safe: no Node imports and no secrets, so it
// can be bundled into a page. Everything that holds a secret lives in `/server`.
export {
  encodeInteraction,
  type HttpTransportOptions,
  httpTransport,
  InteractionError,
  type InteractionResult,
  type InteractionTransport,
  readInteractionResponse,
} from "./interactivity/transport";
export { type HttpResolverClientOptions, httpResolverClient } from "./web-api/http";
