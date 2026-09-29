// Stamps a release's version on the published package.json: `bun scripts/set-version.ts <X.Y.Z>`.
// The release workflow runs it before building, so the versions in the repository stay 0.0.0 and
// the release's git tag is the only place a version is written.
const [version] = process.argv.slice(2);

if (version === undefined || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`set-version: expected a version like 1.2.3, got ${version ?? "nothing"}`);
  process.exit(1);
}

const path = `${import.meta.dirname}/../packages/block-kit/package.json`;
const pkg = await Bun.file(path).json();
pkg.version = version;
await Bun.write(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`@nkootstra/block-kit ${version}`);
