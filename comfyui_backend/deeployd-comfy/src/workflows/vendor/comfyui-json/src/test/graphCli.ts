import { graphToPrompt } from "../graphToPrompt";
import { LGraph } from "litegraph.js";
import x from "./workflow.json";

const y = new LGraph(x)

graphToPrompt(
   y 
).then((prompt) => {
    console.log(JSON.stringify(prompt, null, 2))
})

