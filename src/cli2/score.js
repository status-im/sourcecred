// @flow

import fs from "fs-extra";
import stringify from "json-stable-stringify";
import {join as pathJoin} from "path";

import type {Command} from "./command";
import {makePluginDir, loadInstanceConfig} from "./common";
import {fromJSON as weightedGraphFromJSON} from "../core/weightedGraph";
import {defaultParams} from "../analysis/timeline/params";
import {type WeightedGraph, merge} from "../core/weightedGraph";
import {LoggingTaskReporter} from "../util/taskReporter";
import {
  compute,
  toJSON as credResultToJSON,
  compressByThreshold,
} from "../analysis/credResult";

function die(std, message) {
  std.err("fatal: " + message);
  return 1;
}

// Any cred flow that sums to less than this threshold will be filtered
// from the time-level cred data (though we will still have a summary).
// TODO: Make this a configurable parameter.
const CRED_THRESHOLD = 10;

const scoreCommand: Command = async (args, std) => {
  if (args.length !== 0) {
    return die(std, "usage: sourcecred score");
  }
  const taskReporter = new LoggingTaskReporter();
  taskReporter.start("score");
  const baseDir = process.cwd();
  const config = await loadInstanceConfig(baseDir);

  const graphOutputPrefix = ["output", "graphs"];
  async function loadGraph(pluginName): Promise<WeightedGraph> {
    const outputDir = makePluginDir(baseDir, graphOutputPrefix, pluginName);
    const outputPath = pathJoin(outputDir, "graph.json");
    const graphJSON = JSON.parse(await fs.readFile(outputPath));
    return weightedGraphFromJSON(graphJSON);
  }

  const pluginNames = Array.from(config.bundledPlugins.keys());
  const graphs = await Promise.all(pluginNames.map(loadGraph));
  const combinedGraph = merge(graphs);

  const plugins = Array.from(config.bundledPlugins.values());
  const declarations = plugins.map((x) => x.declaration());

  // TODO: Support loading params from config.
  const params = defaultParams();

  const credResult = await compute(combinedGraph, params, declarations);
  const compressed = compressByThreshold(credResult, CRED_THRESHOLD);
  const credJSON = stringify(credResultToJSON(compressed));
  const outputPath = pathJoin(baseDir, "output", "credResult.json");
  await fs.writeFile(outputPath, credJSON);
  taskReporter.finish("score");
  return 0;
};

export default scoreCommand;
