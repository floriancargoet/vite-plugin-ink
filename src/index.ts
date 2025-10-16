import path from "node:path";
import fs from "node:fs";
import EventEmitter from "node:events";

import {ModuleNode, PluginOption} from "vite";
import { CompilerOptions } from "inkjs/compiler/CompilerOptions";
import { Compiler } from "inkjs/compiler/Compiler";
import {IFileHandler} from "inkjs/compiler/IFileHandler";

class Tracker {
  // Track dependencies of main ink files for hot reloading
  // dependency file => main file
  filesToTrack = new Map<string, Set<string>>();

  /** Track a new file linked to the main file. */
  track(main: string, toTrack: string) {
    const includedFrom = this.filesToTrack.get(toTrack) ?? new Set<string>();
    if (!includedFrom.has(main)) {
      includedFrom.add(main);
    }
  }

  /** Stop tracking all files linked to this main file. */
  clear(main: string) {
    for (const [trackedDep, linkedMains] of this.filesToTrack) {
      if (linkedMains.has(main)) {
        if (linkedMains.size === 1) {
          this.filesToTrack.delete(trackedDep);
        } else {
          linkedMains.delete(trackedDep);
        }
        this.filesToTrack.delete(trackedDep);
      }
    }
  }

  /** Get the main file linked to the given file.
   * @returns The main file or undefined if not tracked.
   */
  getTrackedMains(maybeTracked: string): ReadonlySet<string> {
    return this.filesToTrack.get(maybeTracked) ?? new Set<string>();
  }
}

const inkTracker = new Tracker();

type TemplateEngine = Record<
  string,
  (fileName: string, source: string) => string
>;
type Matchable = {[Symbol.match]: (text: string) => RegExpMatchArray|null};
type FileNamePatternTester = (fileName: string) => boolean;
type TestFileNamePattern = string|string[]|Matchable|FileNamePatternTester;
type Options = {
  inkFileNamePattern?: TestFileNamePattern
  templateEngine?: TemplateEngine;
  testHarness?: string;
  testFileNamePattern?: TestFileNamePattern;
};

function convertToFileNamePatternTester(pattern: TestFileNamePattern|undefined): FileNamePatternTester {
    if (typeof pattern === 'function') {
        return pattern;
    } else if (typeof pattern === 'undefined') {
        return () => false;
    } else if (typeof pattern === 'string') {
        return (fileName: string) => fileName.endsWith(pattern);
    } else if (Array.isArray(pattern)) {
        if (pattern.length === 1) {
            return convertToFileNamePatternTester(pattern[0])
        }
        return (fileName: string) => pattern.some(suffix => fileName.endsWith(suffix));
    } else {
        return (fileName: string) => fileName.match(pattern) !== null;
    }
}

// The Vite plugin
export function ink(options: Options = {}): PluginOption {
  const isInkFile: FileNamePatternTester = convertToFileNamePatternTester(options.inkFileNamePattern ?? ".ink")
  const isTestFile: FileNamePatternTester = convertToFileNamePatternTester(options.testFileNamePattern)
  return {
    name: "vite-plugin-ink",
    // Transform imported ink files into JS modules that export an instance of Story.
    transform(this: Reporter, source, fileName) {
      if (isInkFile(fileName)) {
        const storyJSON = compileInkToJSONString(
          fileName,
          this,
          inkTracker,
          options.templateEngine
        );
        if (!storyJSON) return;
        return generateStoryModule(storyJSON, (isTestFile(fileName) ? options.testHarness : null) ?? "");
      }
    },

    // When any .ink is modified, trigger a hot reload update on the generated JS module for the main ink files that
    // include it.
    handleHotUpdate(this: void, { file, server }) {
      const mainInkToReload = inkTracker.getTrackedMains(file);
      const modulesToReload = new Set<ModuleNode>()
      for (const mainInk of mainInkToReload) {
        const jsModulesToReload =
          server.moduleGraph.getModulesByFile(mainInk) ?? [];
        for (const module of jsModulesToReload) {
          modulesToReload.add(module)
        }
      }
      return Array.from(modulesToReload)
    },
  };
}

function generateStoryModule(storyData: string, testHarness: string) {
  return `import { Story } from "inkjs/engine/Story";
const story = new Story(${storyData});

let _callback;
function onHotReload(callback) {
  _callback = callback;
}

export default story;
export { story, onHotReload };

// Self accepting hot reload
if (import.meta.hot) {
  let prevModule;
  import.meta.hot.accept((module) => {
    if (!module || typeof _callback !== "function") {
      import.meta.hot.invalidate("You can avoid full reloads by providing a callback to onHotReload. See https://github.com/floriancargoet/vite-plugin-ink/#hot-reload");
      return;
    }
    // Hot reload sometimes fires multiple times with the exact same module instance (e.g. when saving a multiple files project from Inky)
    // We don't want to invoke the callback with the same story instance since it has already been initialized.
    if (prevModule !== module) {
      prevModule = module;
      module.onHotReload(_callback);
      _callback(module.story);
    }
  })
}
${testHarness}
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
  tracker: Tracker,
  templateEngine?: TemplateEngine
) {
  // Remove all tracked files so that we don't keep old dependencies.
  tracker.clear(inkPath);
  // A file handler to resolve ink INCLUDEs
  const fileHandler = new InkFileHandler(inkPath, templateEngine);
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

class InkFileHandler extends EventEmitter implements IFileHandler {
  mainFilePath: string;
  rootPath: string;
  templateEngine: TemplateEngine;

  constructor(mainFilePath = "", templateEngine: TemplateEngine = {}) {
    super();
    this.rootPath = path.dirname(mainFilePath);
    this.mainFilePath = mainFilePath;
    this.templateEngine = templateEngine;
  }
  ResolveInkFilename(fileName: string) {
    const resolved = path.resolve(this.rootPath, fileName);
    if (resolved != this.mainFilePath) {
      this.emit("dependency", resolved);
    }
    return resolved;
  }
  LoadInkFileContents(fileName: string) {
    const ext = getExtension(fileName);
    const source = fs.readFileSync(fileName, "utf-8");
    if (ext && ext in this.templateEngine) {
      return this.templateEngine[ext](fileName, source);
    }
    return source;
  }
}

function getExtension(fileName: string) {
  const parts = fileName.split(".");
  if (parts.length > 0) {
    return parts[parts.length - 1];
  }
}
