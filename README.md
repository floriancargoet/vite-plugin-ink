# vite-plugin-ink

A Vite plugin to compile and hot-reload Inkle's ink files

## Installation

```
npm install --save-dev vite-plugin-ink
```

## Vite configuration

In `vite.config.json`:

```
import { defineConfig } from "vite";
import { ink } from "vite-plugin-ink";

export default defineConfig({
  plugins: [ink()],
});
```

## TypeScript

TypeScript doesn't know that `.ink` files export a Story.
You can tell it by adding a `ink-env.d.ts` file in your `src/` folder:

```
/// <reference types="vite-plugin-ink/ink" />
```

(you can also add this line to the existing `vite-env.d.ts`.)

## Importing a story

```
import story from "./story.ink"; // default import
// OR
import { story } from "./story.ink"; // named import
```

## Hot reload

To accept hot-reload updates in your application:

```
import { story, onHotReload } from "./story.ink";

onHotReload((newStory) => {
  // Do something with the new story!
  // Recommended: reset the DOM and replay old choices on the new story
})
```

You'll find a minimal project with hot reloading in the `examples/` directory.
