import path from "node:path";
import fs from "node:fs";
import EventEmitter from "node:events";

import { Compiler, CompilerOptions } from "inkjs";
import type { PluginOption } from "vite";

class Tracker {
  // Track dependencies of main ink files for hot reloading
  // dependency file => main file
  filesToTrack = new Map<string, string>();

  /** Track a new file linked to the main file. */
  track(main: string, toTrack: string) {
    this.filesToTrack.set(toTrack, main);
  }

  /** Stop tracking all files linked to this main file. */
  clear(main: string) {
    for (const [trackedDep, linkedMain] of this.filesToTrack) {
      if (linkedMain === main) {
        this.filesToTrack.delete(trackedDep);
      }
    }
  }

  /** Get the main file linked to the given file.
   * @returns The main file or undefined if not tracked.
   */
  getTrackedMain(maybeTracked: string): string | void {
    return this.filesToTrack.get(maybeTracked);
  }
}

const inkTracker = new Tracker();

// The Vite plugin
export function ink(): PluginOption {
  return {
    name: "vite-plugin-ink",
    // Transform imported ink files into JS modules that export an instance of Story.
    transform(source, fileName) {
      if (fileName.endsWith(".ink")) {
        const storyJSON = compileInkToJSONString(fileName, this, inkTracker);
        if (!storyJSON) return;
        return generateStoryModule(storyJSON);
      }
    },

    // When any .ink is modified, trigger a hot reload update on the generated JS module for the main ink file.
    handleHotUpdate({ file, server }) {
      const mainInkToReload = inkTracker.getTrackedMain(file);
      if (mainInkToReload) {
        const jsModulesToReload =
          server.moduleGraph.getModulesByFile(mainInkToReload) ?? [];
        return Array.from(jsModulesToReload);
      }
    },
  };
}

function generateStoryModule(storyData: string) {
  // Importing from inkjs/engine/Story breaks the production build so we import from a pre-bundled ink (engine only, no compiler)
  return `import { Story } from "inkjs/dist/ink-es6";
export default new Story(${storyData});
`;
}

const logTypes = ["info", "warn", "error"] as const;

type Reporter = Record<(typeof logTypes)[number], (message: string) => void>;

/**
 * Compile the ink file at the given path, using reporter to handle compilation messages & tracker to track the ink dependencies.
 * @returns compiled story as a JSON string.
 */
function compileInkToJSONString(
  inkPath: string,
  reporter: Reporter,
  tracker: Tracker
) {
  // Remove all tracked files so that we don't keep old dependencies.
  tracker.clear(inkPath);
  // A file handler to resolve ink INCLUDEs
  const fileHandler = new InkFileHandler(inkPath);
  // We want to track those INCLUDEs for hot reloading.
  fileHandler.on("dependency", (dep) => tracker.track(inkPath, dep));

  // Setup the compiler…
  const mainInk = fileHandler.LoadInkFileContents(inkPath);
  const compilerOptions = new CompilerOptions(
    inkPath,
    undefined,
    undefined,
    (message, type) => reporter[logTypes[type]](message),
    fileHandler
  );

  // …and compile to JSON.
  return new Compiler(mainInk, compilerOptions).Compile().ToJson();
}

class InkFileHandler extends EventEmitter {
  mainFilePath: string;
  rootPath: string;
  constructor(mainFilePath = "") {
    super();
    this.rootPath = path.dirname(mainFilePath);
    this.mainFilePath = mainFilePath;
  }
  ResolveInkFilename(fileName: string) {
    const resolved = path.resolve(this.rootPath, fileName);
    if (resolved != this.mainFilePath) {
      this.emit("dependency", resolved);
    }
    return resolved;
  }
  LoadInkFileContents(fileName: string) {
    return fs.readFileSync(fileName, "utf-8");
  }
}
