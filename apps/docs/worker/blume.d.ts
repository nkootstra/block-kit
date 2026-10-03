// Blume ships TypeScript sources, so type-checking the modules the Worker and `scripts/mcp.ts`
// import follows them into Blume's other modules, which import packages for features this site
// doesn't use (hosted search, AsyncAPI) or that have no types.
declare module "@asyncapi/converter";
declare module "@oramacloud/client";
declare module "algoliasearch";
declare module "html-escaper";
declare module "picomatch";
declare module "typesense";
