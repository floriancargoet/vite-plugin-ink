# vite-plugin-ink

A Vite plugin to compile and hot-reload Inkle's ink files

## Installation

```
npm install --save-dev vite-plugin-ink
```

## Vite configuration

In `vite.config.js`:

```ts
import { defineConfig } from "vite";
import { ink } from "vite-plugin-ink";

export default defineConfig({
  plugins: [ink()],
});
```

### Extensions

By default, this plugin transforms all files with names ending in `.ink`.

To find ink files with different names, such as when using templating, pass an object containing
`inkFileNamePattern` to the plugin. `inkFileNamePattern` can be:
* a string (a suffix to look for)
* an array of strings (an array of suffixes to look for)
* a regular expression or other object with `{[Symbol.match](text: string) => RegExpMatchArray|null}` which indicates
  an ink file if it matches
* a function with the signature `(fileName: string) => boolean` which returns true when a file is an ink file

```ts
import { defineConfig } from "vite";
import { ink } from "vite-plugin-ink";

export default defineConfig({
  plugins: [ink({
      inkFileNamePattern: ['.story.ink', '.test.ink']
  })],
});
```

### Templating

To use a templating language on your ink files, pass an object containing `templateEngines` to the plugin.
`templateEngines` is an object mapping file extensions to transformers, taking the signature
`(fileName: string, source: string) => string` 

Note that if you want to directly import a templated ink file from JavaScript, you will need to set
`inkFileNamePattern` as well.

```ts
import { defineConfig } from "vite";
import { ink } from "vite-plugin-ink";
import nunjucks from "nunjucks";

export default defineConfig({
  plugins: [ink({
      inkFileNamePattern: [".ink", ".ink.njk"],
      templateEngines: {
        "njk": (fileName, source) => nunjucks.renderString(source, {fileName, "greeting": "Hello World!"})     
      },
  })],
});
```

Then, in your ink file, you can `INCLUDE` a file with that suffix, and it will be templated by nunjucks:
```
INCLUDE greeting.ink.njk
```

### Testing

To test your ink functions using a separate ink file using [Vitest](https://vitest.dev/) or other test framework that
uses your Vite build, pass an object containing `testHarness` and `testFileNamePattern`.

`testFileNamePattern` can have similar definitions to `inkFileNamePattern`:
* a string (a suffix to look for)
* an array of strings (an array of suffixes to look for)
* a regular expression or other object with `{[Symbol.match](text: string) => RegExpMatchArray|null}` which indicates
  a test file if it matches
* a function with the signature `(fileName: string) => boolean` which returns true when a file is a test file

However, note that the ink file will not be transformed at all unless the file name also matches `inkFileNamePattern`.

`testHarness` is a bit of JavaScript module code that will go at the end of the generated module for a test file, using
the `story` variable to retrieve the story. Since this code will need to use an absolute path due to not knowing where
the ink file is, using an alias is recommended if your test module is in the local repository.

```ts
import { defineConfig } from "vite";
import { ink } from "vite-plugin-ink";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
      alias: {
          '@testInk': resolve(__dirname, "src/testing/ink.ts"),
      },
  },
  plugins: [ink({
      inkFileNamePattern: ['.story.ink', '.test.ink'],
      testFileNamePattern: '.test.ink',
      testHarness: `
        import testInk from "@testInk";
        testInk(story);
      `,
  })],
});
```

## TypeScript

TypeScript doesn't know that `.ink` files export a Story.
You can tell it by adding a `ink-env.d.ts` file in your `src/` folder:

```ts
/// <reference types="vite-plugin-ink/global" />
```

(you can also add this line to the existing `vite-env.d.ts`.)

### Custom Extensions

Note that the above **only gives typing to `*.ink` modules**; if you want to import ink modules with other file names,
you will need to define the types manually in your `ink-env.d.ts` or `vite-env.d.ts` in addition to setting a custom
extension in your `vite.config.js` as listed above:

```ts
declare module "*.ink.njk" {
    // Do not import outside of this declare module
    import type { Story } from "inkjs/engine/Story";
    type HotReloadCallback = (newStory: Story) => void;
    function onHotReload(callback: HotReloadCallback): void;

    const story: Story;
    export default story;
    export { story, onHotReload };
}
```

Making sure to only import `*.ink` files from TypeScript is easiest.

## Importing a story

```ts
import story from "./story.ink"; // default import
// OR
import { story } from "./story.ink"; // named import
```

## Hot reload

To accept hot-reload updates in your application:

```ts
import { story, onHotReload } from "./story.ink";

onHotReload((newStory) => {
  // Do something with the new story!
  // Recommended: reset the DOM and replay old choices on the new story
})
```

You'll find a minimal project with hot reloading in the `examples/` directory.