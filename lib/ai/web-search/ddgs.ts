/**
 * Creates a DDGS instance from the vendored upstream package.
 * The dynamic import keeps startup behavior close to the previous implementation.
 */
export async function createDDGS() {
  const { DDGS } = await import("@/vendors/duckduckgo-search/index.js");
  return new DDGS();
}
