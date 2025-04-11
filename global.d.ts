declare module "*.ink" {
  // Do not import outside of this declare module
  import type { Story } from "inkjs/engine/Story";
  type HotReloadCallback = (newStory: Story) => void;
  function onHotReload(callback: HotReloadCallback): void;

  const story: Story;
  export default story;
  export { story, onHotReload };
}
