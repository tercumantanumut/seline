// Ambient module shims for Next.js generated validator imports during type checking.
// These paths are generated inside .next/types and may reference JS files that don't exist pre-build.

declare module "../../app/page.js" {
  const Page: unknown
  export default Page
}

declare module "../../app/layout.js" {
  const Layout: unknown
  export default Layout
}

declare module "../../app/api-docs/page.js" {
  const ApiDocsPage: unknown
  export default ApiDocsPage
}

declare module "../../../../src/app/page.js" {
  const SrcPage: unknown
  export default SrcPage
}

declare module "../../../../src/app/layout.js" {
  const SrcLayout: unknown
  export default SrcLayout
}

declare module "../../../../src/app/api-docs/page.js" {
  const SrcApiDocsPage: unknown
  export default SrcApiDocsPage
}
