/**
 * `@pack/profile` is aliased by `vite.config.ts` to the profile.json of the
 * language this build is for (LANG_PACK, default latin).
 */
declare module "@pack/profile" {
  const profile: unknown;
  export default profile;
}
