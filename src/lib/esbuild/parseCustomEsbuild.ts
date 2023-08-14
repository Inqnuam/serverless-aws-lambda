import type { BuildOptions } from "esbuild";

export const parseCustomEsbuild = (customConfig: BuildOptions) => {
  let customEsBuild: any = {};
  if (Array.isArray(customConfig.plugins)) {
    customEsBuild.plugins = customConfig.plugins;
  }

  if (Array.isArray(customConfig.external)) {
    customEsBuild.external = customConfig.external;
  }

  if ("sourcemap" in customConfig) {
    customEsBuild.sourcemap = customConfig.sourcemap;
  }

  if (typeof customConfig.sourceRoot == "string") {
    customEsBuild.sourceRoot = customConfig.sourceRoot;
  }

  if (typeof customConfig.format == "string") {
    customEsBuild.format = customConfig.format;
  }

  if ("sourcesContent" in customConfig) {
    customEsBuild.sourcesContent = customConfig.sourcesContent;
  }

  if (typeof customConfig.minify == "boolean") {
    customEsBuild.minify = customConfig.minify;
  }

  if (typeof customConfig.minifyWhitespace == "boolean") {
    customEsBuild.minifyWhitespace = customConfig.minifyWhitespace;
  }

  if (typeof customConfig.minifyIdentifiers == "boolean") {
    customEsBuild.minifyIdentifiers = customConfig.minifyIdentifiers;
  }

  if (typeof customConfig.minifySyntax == "boolean") {
    customEsBuild.minifySyntax = customConfig.minifySyntax;
  }

  if (typeof customConfig.jsx == "string") {
    customEsBuild.jsx = customConfig.jsx;
  }

  if (typeof customConfig.jsxFactory == "string") {
    customEsBuild.jsxFactory = customConfig.jsxFactory;
  }

  if (typeof customConfig.jsxFragment == "string") {
    customEsBuild.jsxFragment = customConfig.jsxFragment;
  }

  if (typeof customConfig.jsxImportSource == "string") {
    customEsBuild.jsxImportSource = customConfig.jsxImportSource;
  }

  if ("jsxDev" in customConfig) {
    customEsBuild.jsxDev = customConfig.jsxDev;
  }

  if ("jsxSideEffects" in customConfig) {
    customEsBuild.jsxSideEffects = customConfig.jsxSideEffects;
  }

  if (typeof customConfig.outdir == "string") {
    customEsBuild.outdir = customConfig.outdir;
  }

  if (typeof customConfig.outbase == "string") {
    customEsBuild.outbase = customConfig.outbase;
  }

  if (typeof customConfig.target == "string" || Array.isArray(customConfig.target)) {
    customEsBuild.target = customConfig.target;
  }

  if (typeof customConfig.tsconfig == "string") {
    customEsBuild.tsconfig = customConfig.tsconfig;
  }

  if (customConfig.tsconfigRaw && ["string", "object"].includes(typeof customConfig.tsconfigRaw)) {
    customEsBuild.tsconfigRaw = customConfig.tsconfigRaw;
  }

  if (typeof customConfig.legalComments == "string") {
    customEsBuild.legalComments = customConfig.legalComments;
  }

  if (Array.isArray(customConfig.pure)) {
    customEsBuild.pure = customConfig.pure;
  }

  if (Array.isArray(customConfig.drop)) {
    customEsBuild.drop = customConfig.drop;
  }

  if (Array.isArray(customConfig.dropLabels)) {
    customEsBuild.dropLabels = customConfig.dropLabels;
  }

  if (Array.isArray(customConfig.resolveExtensions)) {
    customEsBuild.resolveExtensions = customConfig.resolveExtensions;
  }

  if (Array.isArray(customConfig.mainFields)) {
    customEsBuild.mainFields = customConfig.mainFields;
  }

  if (Array.isArray(customConfig.nodePaths)) {
    customEsBuild.nodePaths = customConfig.nodePaths;
  }

  if (typeof customConfig.ignoreAnnotations == "boolean") {
    customEsBuild.ignoreAnnotations = customConfig.ignoreAnnotations;
  }
  if (typeof customConfig.treeShaking == "boolean") {
    customEsBuild.treeShaking = customConfig.treeShaking;
  }

  if (customConfig.define && typeof customConfig.define == "object") {
    customEsBuild.define = customConfig.define;
  }

  if (customConfig.banner && typeof customConfig.banner == "object") {
    customEsBuild.banner = customConfig.banner;
  }
  if (customConfig.footer && typeof customConfig.footer == "object") {
    customEsBuild.footer = customConfig.footer;
  }
  if (customConfig.loader && typeof customConfig.loader == "object") {
    customEsBuild.loader = customConfig.loader;
  }
  if (customConfig.alias && typeof customConfig.alias == "object") {
    customEsBuild.alias = customConfig.alias;
  }

  if (typeof customConfig.assetNames == "string") {
    customEsBuild.assetNames = customConfig.assetNames;
  }
  if (typeof customConfig.entryNames == "string") {
    customEsBuild.entryNames = customConfig.entryNames;
  }

  if (typeof customConfig.publicPath == "string") {
    customEsBuild.publicPath = customConfig.publicPath;
  }

  if (typeof customConfig.splitting == "boolean") {
    customEsBuild.splitting = customConfig.splitting;
  }

  if (typeof customConfig.preserveSymlinks == "boolean") {
    customEsBuild.preserveSymlinks = customConfig.preserveSymlinks;
  }

  if (Array.isArray(customConfig.inject)) {
    customEsBuild.inject = customConfig.inject;
  }

  if (typeof customConfig.keepNames == "boolean") {
    customEsBuild.keepNames = customConfig.keepNames;
  }

  if (customConfig.supported && typeof customConfig.supported == "object") {
    customEsBuild.supported = customConfig.supported;
  }

  if (Array.isArray(customConfig.entryPoints)) {
    customEsBuild.entryPoints = customConfig.entryPoints;
  }

  if (Array.isArray(customConfig.conditions)) {
    customEsBuild.conditions = customConfig.conditions;
  }

  if (typeof customConfig.absWorkingDir == "string") {
    customEsBuild.absWorkingDir = customConfig.absWorkingDir;
  }

  if (customConfig.mangleProps instanceof RegExp) {
    customEsBuild.mangleProps = customConfig.mangleProps;
  }

  if (customConfig.reserveProps instanceof RegExp) {
    customEsBuild.reserveProps = customConfig.reserveProps;
  }

  if (typeof customConfig.mangleQuoted == "boolean") {
    customEsBuild.mangleQuoted = customConfig.mangleQuoted;
  }

  if (customConfig.mangleCache && typeof customConfig.mangleCache == "object") {
    customEsBuild.mangleCache = customConfig.mangleCache;
  }

  if (typeof customConfig.packages == "string") {
    customEsBuild.packages = customConfig.packages;
  }

  if (customConfig.logOverride && typeof customConfig.logOverride == "object") {
    customEsBuild.logOverride = customConfig.logOverride;
  }
  return customEsBuild;
};
