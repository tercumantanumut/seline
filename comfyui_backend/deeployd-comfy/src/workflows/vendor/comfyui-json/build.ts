import dts from 'bun-plugin-dts'

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: './dist',
  minify: false,
  target: "browser",
  format: "esm",
  external: ["zod", "bun"],
  plugins: [dts()],
});
