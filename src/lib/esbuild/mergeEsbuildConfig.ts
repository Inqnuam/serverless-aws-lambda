import type { BuildOptions } from "esbuild";

export const mergeEsbuildConfig = (esBuildConfig: BuildOptions, customEsBuildConfig: BuildOptions) => {
  if (Array.isArray(customEsBuildConfig.plugins)) {
    esBuildConfig.plugins!.push(...customEsBuildConfig.plugins);
  }

  if (Array.isArray(customEsBuildConfig.external)) {
    esBuildConfig.external!.push(...customEsBuildConfig.external);
  }

  if ("sourcemap" in customEsBuildConfig) {
    esBuildConfig.sourcemap = customEsBuildConfig.sourcemap;
  }

  if (typeof customEsBuildConfig.sourceRoot == "string") {
    esBuildConfig.sourceRoot = customEsBuildConfig.sourceRoot;
  }

  if ("sourcesContent" in customEsBuildConfig) {
    esBuildConfig.sourcesContent = customEsBuildConfig.sourcesContent;
  }

  if (typeof customEsBuildConfig.minify == "boolean") {
    esBuildConfig.minify = customEsBuildConfig.minify;
  }

  if (typeof customEsBuildConfig.minifyWhitespace == "boolean") {
    esBuildConfig.minifyWhitespace = customEsBuildConfig.minifyWhitespace;
  }

  if (typeof customEsBuildConfig.minifyIdentifiers == "boolean") {
    esBuildConfig.minifyIdentifiers = customEsBuildConfig.minifyIdentifiers;
  }

  if (typeof customEsBuildConfig.minifySyntax == "boolean") {
    esBuildConfig.minifySyntax = customEsBuildConfig.minifySyntax;
  }

  if (typeof customEsBuildConfig.jsx == "string") {
    esBuildConfig.jsx = customEsBuildConfig.jsx;
  }

  if (typeof customEsBuildConfig.jsxFactory == "string") {
    esBuildConfig.jsxFactory = customEsBuildConfig.jsxFactory;
  }

  if (typeof customEsBuildConfig.jsxFragment == "string") {
    esBuildConfig.jsxFragment = customEsBuildConfig.jsxFragment;
  }

  if (typeof customEsBuildConfig.jsxImportSource == "string") {
    esBuildConfig.jsxImportSource = customEsBuildConfig.jsxImportSource;
  }

  if ("jsxDev" in customEsBuildConfig) {
    esBuildConfig.jsxDev = customEsBuildConfig.jsxDev;
  }

  if ("jsxSideEffects" in customEsBuildConfig) {
    esBuildConfig.jsxSideEffects = customEsBuildConfig.jsxSideEffects;
  }

  if (typeof customEsBuildConfig.outdir == "string") {
    esBuildConfig.outdir = customEsBuildConfig.outdir;
  }

  if (typeof customEsBuildConfig.outbase == "string") {
    esBuildConfig.outbase = customEsBuildConfig.outbase;
  }

  if (typeof customEsBuildConfig.target == "string" || Array.isArray(customEsBuildConfig.target)) {
    esBuildConfig.target = customEsBuildConfig.target;
  }

  if (typeof customEsBuildConfig.tsconfig == "string") {
    esBuildConfig.tsconfig = customEsBuildConfig.tsconfig;
  }

  // @ts-ignore
  if (typeof customEsBuildConfig.tsconfigRaw == "string") {
    // @ts-ignore
    esBuildConfig.tsconfigRaw = customEsBuildConfig.tsconfigRaw;
  }

  if (typeof customEsBuildConfig.legalComments == "string") {
    esBuildConfig.legalComments = customEsBuildConfig.legalComments;
  }

  if (Array.isArray(customEsBuildConfig.pure)) {
    esBuildConfig.pure = customEsBuildConfig.pure;
  }

  if (Array.isArray(customEsBuildConfig.drop)) {
    esBuildConfig.drop = customEsBuildConfig.drop;
  }

  if (Array.isArray(customEsBuildConfig.resolveExtensions)) {
    esBuildConfig.resolveExtensions = customEsBuildConfig.resolveExtensions;
  }

  if (Array.isArray(customEsBuildConfig.mainFields)) {
    esBuildConfig.mainFields = customEsBuildConfig.mainFields;
  }

  if (Array.isArray(customEsBuildConfig.nodePaths)) {
    esBuildConfig.nodePaths = customEsBuildConfig.nodePaths;
  }

  if (typeof customEsBuildConfig.ignoreAnnotations == "boolean") {
    esBuildConfig.ignoreAnnotations = customEsBuildConfig.ignoreAnnotations;
  }
  if (typeof customEsBuildConfig.treeShaking == "boolean") {
    esBuildConfig.treeShaking = customEsBuildConfig.treeShaking;
  }

  if (customEsBuildConfig.define && typeof customEsBuildConfig.define == "object") {
    esBuildConfig.define = customEsBuildConfig.define;
  }

  if (customEsBuildConfig.banner && typeof customEsBuildConfig.banner == "object") {
    esBuildConfig.banner = customEsBuildConfig.banner;
  }
  if (customEsBuildConfig.footer && typeof customEsBuildConfig.footer == "object") {
    esBuildConfig.footer = customEsBuildConfig.footer;
  }

  if (customEsBuildConfig.loader && typeof customEsBuildConfig.loader == "object") {
    esBuildConfig.loader = customEsBuildConfig.loader;
  }
  if (customEsBuildConfig.alias && typeof customEsBuildConfig.alias == "object") {
    esBuildConfig.alias = customEsBuildConfig.alias;
  }

  if (typeof customEsBuildConfig.assetNames == "string") {
    esBuildConfig.assetNames = customEsBuildConfig.assetNames;
  }

  if (typeof customEsBuildConfig.entryNames == "string") {
    esBuildConfig.entryNames = customEsBuildConfig.entryNames;
  }

  if (typeof customEsBuildConfig.publicPath == "string") {
    esBuildConfig.publicPath = customEsBuildConfig.publicPath;
  }

  if (Array.isArray(customEsBuildConfig.inject)) {
    esBuildConfig.inject = customEsBuildConfig.inject;
  }

  if (typeof customEsBuildConfig.splitting == "boolean") {
    esBuildConfig.splitting = customEsBuildConfig.splitting;
  }

  if (typeof customEsBuildConfig.preserveSymlinks == "boolean") {
    esBuildConfig.preserveSymlinks = customEsBuildConfig.preserveSymlinks;
  }

  return esBuildConfig;
};
