import { loadApiJson } from "../fileToWorkflow";
import { generateDependencyGraph } from "..";
import x from "../api.json";

generateDependencyGraph({ workflow_api: x }).then((graph) => {
  console.log(JSON.stringify(graph, null, 2));
});
