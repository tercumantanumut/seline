import { LGraph } from "litegraph.js";

// await $`diff ${file("generated_api_output.json")} ${file("workflow_api.json")}`;
export async function graphToPrompt(graph: LGraph) {
  for (const outerNode of graph.computeExecutionOrder(false, undefined)) {
    if (outerNode.widgets) {
      for (const widget of outerNode.widgets) {
        // Allow widgets to run callbacks before a prompt has been queued
        // e.g. random seed before every gen
        widget.beforeQueued?.();
      }
    }

    const innerNodes = outerNode.getInnerNodes
      ? outerNode.getInnerNodes()
      : [outerNode];
    for (const node of innerNodes) {
      if (node.isVirtualNode) {
        // Don't serialize frontend only nodes but let them make changes
        if (node.applyToGraph) {
          node.applyToGraph();
        }
      }
    }
  }

  const workflow = graph.serialize();
  const output: Record<string, any> = {};
  // Process nodes in order of execution
  for (const outerNode of graph.computeExecutionOrder(false, undefined)) {
    const skipNode = outerNode.mode === 2 || outerNode.mode === 4;
    const innerNodes = !skipNode && outerNode.getInnerNodes
      ? outerNode.getInnerNodes()
      : [outerNode];
    for (const node of innerNodes) {
      if (node.isVirtualNode) {
        continue;
      }

      if (node.mode === 2 || node.mode === 4) {
        // Don't serialize muted nodes
        continue;
      }

      const inputs: Record<string, any> = {};
      const widgets = node.widgets;

      // Store all widget values
      if (widgets) {
        for (const i in widgets) {
          const widget = widgets[i];
          if (!widget.options || widget.options.serialize !== false) {
            inputs[widget.name] = widget.serializeValue
              ? await widget.serializeValue(node, i)
              : widget.value;
          }
        }
      }

      console.log('node: ', node)
      // console.log('widgets: ', widgets)
      // console.log("inputs after widgets: ", inputs)

      // Store all node links
      for (const i in node.inputs) {
        let parent = node.getInputNode(i);
        if (parent) {
          let link = node.getInputLink(i);
          while (parent.mode === 4 || parent.isVirtualNode) {
            let found = false;
            if (parent.isVirtualNode) {
              link = parent.getInputLink(link.origin_slot);
              if (link) {
                parent = parent.getInputNode(link.target_slot);
                if (parent) {
                  found = true;
                }
              }
            } else if (link && parent.mode === 4) {
              let all_inputs = [link.origin_slot];
              if (parent.inputs) {
                all_inputs = all_inputs.concat(Object.keys(parent.inputs));
                for (let parent_input in all_inputs) {
                  parent_input = all_inputs[parent_input];
                  if (parent.inputs[parent_input]?.type === node.inputs[i].type) {
                    link = parent.getInputLink(parent_input);
                    if (link) {
                      parent = parent.getInputNode(parent_input);
                    }
                    found = true;
                    break;
                  }
                }
              }
            }

            if (!found) {
              break;
            }
          }

          if (link) {
            if (parent?.updateLink) {
              link = parent.updateLink(link);
            }
            if (link) {
              inputs[node.inputs[i].name] = [
                String(link.origin_id),
                parseInt(link.origin_slot),
              ];
            }
          }
        }
      }

      const node_data = {
        inputs,
        class_type: node.type,
      };

      //   if (this.ui.settings.getSettingValue("Comfy.DevMode")) {
      //     // Ignored by the backend.
      //     node_data["_meta"] = {
      //       title: node.title,
      //     };
      //   }
      output[String(node.id)] = node_data;
    }
  }

  // Remove inputs connected to removed nodes
  for (const o in output) {
    for (const i in output[o].inputs) {
      if (Array.isArray(output[o].inputs[i]) &&
        output[o].inputs[i].length === 2 &&
        !output[output[o].inputs[i][0]]) {
        delete output[o].inputs[i];
      }
    }
  }

  return { workflow, output };
}