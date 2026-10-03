// Blume ships TypeScript sources, so type-checking the modules the Worker and `scripts/mcp.ts`
// import follows them into Blume's other modules, which import packages for features this site
// doesn't use (hosted search, AsyncAPI) or that have no types.
declare module "@asyncapi/converter";
declare module "@oramacloud/client";
declare module "html-escaper";
declare module "picomatch";
declare module "typesense";

// Typed as far as Blume's Algolia sync reads it, which its callbacks need.
declare module "algoliasearch" {
  export function algoliasearch(
    appId: string,
    apiKey: string,
  ): {
    getSettings(request: object): Promise<{
      attributeForDistinct?: string;
      attributesForFaceting?: string[];
      customRanking?: string[];
    }>;
    replaceAllObjects(request: object): Promise<unknown>;
    setSettings(request: object): Promise<{ taskID: number }>;
    waitForTask(request: object): Promise<unknown>;
  };
}
