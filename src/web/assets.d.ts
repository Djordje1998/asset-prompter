// Images imported by the web code are bundled by Bun and resolve to their served URL.
declare module "*.png" {
  const url: string;
  export default url;
}
