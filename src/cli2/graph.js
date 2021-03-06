// @flow

import fs from "fs-extra";
import sortBy from "lodash.sortby";
import stringify from "json-stable-stringify";
import {join as pathJoin} from "path";

import {LoggingTaskReporter} from "../util/taskReporter";
import {CascadingReferenceDetector} from "../core/references/cascadingReferenceDetector";
import type {Command} from "./command";
import {
  makePluginDir,
  loadInstanceConfig,
  pluginDirectoryContext,
} from "./common";
import {toJSON as weightedGraphToJSON} from "../core/weightedGraph";

function die(std, message) {
  std.err("fatal: " + message);
  return 1;
}

const graphCommand: Command = async (args, std) => {
  if (args.length !== 0) {
    return die(std, "usage: sourcecred graph");
  }
  const taskReporter = new LoggingTaskReporter();
  taskReporter.start("graph");
  const baseDir = process.cwd();
  const config = await loadInstanceConfig(baseDir);
  const graphOutputPrefix = ["output", "graphs"];

  const rd = await buildReferenceDetector(baseDir, config, taskReporter);
  for (const [name, plugin] of config.bundledPlugins) {
    const task = `${name}: generating graph`;
    taskReporter.start(task);
    const dirContext = pluginDirectoryContext(baseDir, name);
    const graph = await plugin.graph(dirContext, rd, taskReporter);
    const serializedGraph = stringify(weightedGraphToJSON(graph));
    const outputDir = makePluginDir(baseDir, graphOutputPrefix, name);
    const outputPath = pathJoin(outputDir, "graph.json");
    await fs.writeFile(outputPath, serializedGraph);
    taskReporter.finish(task);
  }
  taskReporter.finish("graph");
  return 0;
};

async function buildReferenceDetector(baseDir, config, taskReporter) {
  taskReporter.start("reference detector");
  const rds = [];
  for (const [name, plugin] of sortBy(
    [...config.bundledPlugins],
    ([k, _]) => k
  )) {
    const dirContext = pluginDirectoryContext(baseDir, name);
    const task = `reference detector for ${name}`;
    taskReporter.start(task);
    const rd = await plugin.referenceDetector(dirContext, taskReporter);
    rds.push(rd);
    taskReporter.finish(task);
  }
  taskReporter.finish("reference detector");
  return new CascadingReferenceDetector(rds);
}

export default graphCommand;
