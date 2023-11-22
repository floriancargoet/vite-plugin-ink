declare module "*.ink" {
  // Do not import outside of this declare module
  import type { Story } from "inkjs/engine/Story";
  const story: Story;
  export default story;
}
