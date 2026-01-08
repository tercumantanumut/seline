import { $, file } from "bun";
import { parseArgs } from "util";
import path from "path";
import { generateDependencyGraph } from "./generateDependencyGraph";
const { values, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    workflow_api_path: {
      type: "string",
      short: "i",
      default: "./workflow_api.json",
    },
    workflow_path: {
      type: "string",
      short: "w",
      default: "./workflow.json",
    },
    snapshot_path: {
      type: "string",
      short: "s",
      default: "./snapshot.json",
    },
    comfyui_path: {
      type: "string",
      short: "c",
    },
  },
  strict: true,
  allowPositionals: true,
});

const api_file = file(values.workflow_api_path!);
const snapshot_file = file(values.snapshot_path!);

if (!(await api_file.exists())) {
  throw new Error(`File ${values.workflow_api_path} does not exist`);
}

const workflow_api = JSON.parse(await api_file.text());
// const workflow = JSON.parse(await file(values.workflow_path!).text());
const snapshot = (await snapshot_file.exists())
  ? JSON.parse(await snapshot_file.text())
  : undefined;

const computeFileHash = async (_path: string) => {
  const comfyuiPath = values.comfyui_path;
  if (!comfyuiPath) {
    return;
  }

  const f = file(path.join(comfyuiPath, _path));
  const exist = await f.exists();
  if (exist) {
    const a = await f.arrayBuffer();
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(a);
    const hash = hasher.digest("base64");
    // hash = Bun.hash(a).toString();

    return hash;
  }
};

// import { LiteGraph } from "litegraph.js";
// import { graphToPrompt } from "./graphToPrompt";
// var graph = new LiteGraph.LGraph();
// graph.configure(workflow);
// // console.log(graph);
// const a = await graphToPrompt(graph);
// console.log(a.output);

// await $`echo ${JSON.stringify(a.output, null, 2)} > ${file(
//   "generated_api_output.json",
// )}`;

const handleFileUpload = async (
  _path: string,
  hash: string,
  prevHash?: string,
) => {
  console.log(
    `Uploading file ${_path} with hash ${hash} and previous hash ${prevHash}`,
  );

  return _path;
};

const deps = await generateDependencyGraph({
  workflow_api,
  snapshot,
  computeFileHash,
  handleFileUpload,
});

const outputFilePath = path.join(
  path.dirname(values.workflow_api_path!),
  path.basename(
    values.workflow_api_path!,
    path.extname(values.workflow_api_path!),
  ) + "-dependencies.json",
);

await $`echo ${JSON.stringify(deps, null, 2)} > ${file(outputFilePath)}`;

console.log(`Saved to ${outputFilePath}`);
