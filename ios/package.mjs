import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import JSZip from "jszip";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "ios");
const stage = path.join(root, "outputs/ios-private-app");
await fs.mkdir(stage, { recursive: true });
const zip = new JSZip(), manifest = [];
async function copyDirectory(relative) {
  const current = path.join(source, relative);
  for (const entry of await fs.readdir(current, { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) await copyDirectory(next);
    else if (entry.isFile()) await copyFile(next, next);
  }
}
async function copyFile(from, to) {
  const bytes = await fs.readFile(path.join(source, from));
  const destination = path.join(stage, to);
  if (!path.resolve(destination).startsWith(path.resolve(stage) + path.sep)) throw new Error("Invalid package destination");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  const name = to.split(path.sep).join("/");
  zip.file(name, bytes);
  manifest.push({ path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
for (const name of ["QingyanApp", "QingyanTests", "QingyanUITests"]) await copyDirectory(name);
await copyFile("project.yml", "project.yml");
await copyFile("README.md", "README.md");
await copyFile("workflows/build-private-ipa.yml", ".github/workflows/build-private-ipa.yml");
const metadata = JSON.stringify({ app: "qingyan-private-ios", version: "1.5.0", targets: ["iPhone", "iPad"], minimumSystem: "16.0", signed: false, appleSDKBuildVerified: false, files: manifest }, null, 2);
zip.file("package-manifest.json", metadata);
await fs.writeFile(path.join(stage, "package-manifest.json"), metadata);
const destination = path.join(root, "outputs/清研-iPhone-iPad-私人App工程.zip");
await fs.writeFile(destination, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
await fs.copyFile(destination, path.join(root, "outputs/Qingyan-source.zip"));
console.log(JSON.stringify({ sourcePackage: destination, files: manifest.length, containsStudyData: false, signedIPA: false }));
