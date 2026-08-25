// Configuración de Metro para monorepo (npm workspaces): permite que la
// app resuelva @strikeoutlab/core desde packages/core sin publicarlo a npm.
// https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Mapeo explícito del paquete del workspace a su carpeta real. Sin esto,
// Metro depende de que exista el symlink node_modules/@strikeoutlab/core
// que crea `npm install`; en el builder de EAS ese symlink no siempre
// sobrevive y el bundle falla con "Unable to resolve module".
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@strikeoutlab/core": path.resolve(workspaceRoot, "packages/core"),
};

module.exports = config;
