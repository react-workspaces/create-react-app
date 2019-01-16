'use strict';

const fse = require('fs-extra');
const path = require('path');
const findUp = require('find-up');
const glob = require('glob');

const loadPackageJson = packagePath => {
  try {
    const packageObj = fse.readJsonSync(packagePath);
    return packageObj;
  } catch (err) {
    throw err;
  }
};

const getWorkspacesRootConfig = dir => {
  const packageJsonUp = findUp.sync('package.json', { cwd: dir });

  if (packageJsonUp === null) {
    return false;
  }

  const packageObj = loadPackageJson(packageJsonUp);

  if (Reflect.has(packageObj, 'workspaces')) {
    const workspacesRootConfig = {
      root: path.dirname(packageJsonUp),
      workspaces: packageObj.workspaces,
    };
    return workspacesRootConfig;
  }

  const dirUp = path.dirname(dir);
  return getWorkspacesRootConfig(dirUp);
};

const getPackagePaths = (root, workspacesList) => {
  const packageList = [];

  workspacesList.forEach(workspace => {
    const workspaceDir = path.dirname(workspace);
    const workspaceAbsDir = path.join(root, workspaceDir);
    const packageJsonGlob = path.join('**!(node_modules)', 'package.json');
    const packageJsonAbsPaths = glob
      .sync(packageJsonGlob, { cwd: workspaceAbsDir })
      .map(pkgPath => path.join(workspaceAbsDir, pkgPath));

    packageList.push(...packageJsonAbsPaths);
  });

  return packageList;
};

const getDeep = (obj, keyChain) => {
  const nextKey = keyChain.shift();
  const has = Reflect.has(obj, nextKey);
  const val = obj[nextKey];

  if (keyChain.length === 0) {
    return val;
  }

  if (has) {
    return getDeep(val, keyChain);
  }

  return false;
};

const resolveBabelLoaderPaths = ({root, workspacesList}, packageEntry) => {
  const packageJsonPaths = getPackagePaths(root, workspacesList);
  const babelLoaderPaths = [];

  packageJsonPaths.map(absPkgPath => {
    const packageJson = loadPackageJson(absPkgPath);
    const mainSrcFile = getDeep(packageJson, [packageEntry]);

    if (mainSrcFile) {
      const mainSrcPath = path.dirname(mainSrcFile);
      const packageAbsDir = path.dirname(absPkgPath);
      const absSrcPath = path.join(packageAbsDir, mainSrcPath);
      babelLoaderPaths.push(absSrcPath);
    }
  });

  return babelLoaderPaths;
};

const loadAppSettings = appPackageJson => {
  const empty = {};

  const appPackageObj = loadPackageJson(appPackageJson);

  const reactScripts = getDeep(appPackageObj, ['react-scripts']);
  if (!reactScripts) return empty;

  const workspaces = getDeep(reactScripts, ['workspaces']);
  if (!workspaces) return empty;

  return workspaces;
};

const guard = (appDirectory, appPackageJson) => {
  if (!appDirectory) {
    throw new Error('appDirectory not provided');
  }

  if (typeof appDirectory !== 'string') {
    throw new Error('appDirectory should be a string');
  }

  if (!appPackageJson) {
    throw new Error('appPackageJson not provided');
  }

  if (typeof appPackageJson !== 'string') {
    throw new Error('appPackageJson should be a string');
  }
};

const init = paths => {
  guard(paths.appPath, paths.appPackageJson);

  const config = {
    root: null,
    paths: [],
    packageEntry: 'main:src',
    development: true,
    production: true,
  };

  const {root, workspaces} = getWorkspacesRootConfig(paths.appPath);
  const workspacesList = [];

  // Normally "workspaces" in package.json is an array
  if (Array.isArray(workspaces)) {
    workspacesList.push(...workspaces);
  }
  // Sometimes "workspaces" in package.json is an object
  // with a ".packages" sub-array, eg: when used with "nohoist"
  // See: https://yarnpkg.com/blog/2018/02/15/nohoist
  if (!Array.isArray(workspaces)) {
    workspacesList.push(...workspaces.packages);
  }

  if (workspacesList.length === 0) {
    return config;
  }
  console.log('Yarn Workspaces paths detected.');
  config.root = root;

  const appSettings = loadAppSettings(paths.appPackageJson);

  if (Reflect.has(appSettings, 'development')) {
    config.development = appSettings.development ? true : false;
  }

  if (Reflect.has(appSettings, 'production')) {
    config.production = appSettings.production ? true : false;
  }

  if (Reflect.has(appSettings, 'package-entry')) {
    config.packageEntry = appSettings['package-entry'];
  }

  const babelSrcPaths = resolveBabelLoaderPaths(
    {root, workspacesList},
    config.packageEntry
  );
  console.log(
    `Found ${babelSrcPaths.length} path(s) with "${config.packageEntry}" entry.`
  );
  if (babelSrcPaths.length > 0) {
    config.paths.push(...babelSrcPaths);
  }

  console.log('Exporting Workspaces config to Webpack.');
  console.log(config);

  return config;
};

module.exports = {
  init,
};
