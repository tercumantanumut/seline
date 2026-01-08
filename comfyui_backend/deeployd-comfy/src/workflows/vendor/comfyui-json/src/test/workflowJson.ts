import workflow_json  from "./workflow.json";
import { computeCustomNodesMapJson } from "../computeCustomNodesMap";
import { generateDependencyGraphJson } from "../generateDependencyGraph";

// generateDependencyGraphJson({ workflow_json }).then((deps) => {
//   console.log(deps)
// })

computeCustomNodesMapJson({ workflow_json }).then((deps) => {
  console.log(JSON.stringify(deps, null, 2))
})
