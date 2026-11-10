import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const packageDirectory=path.join(root,"outputs","desktop-app");
const {LocalStore}=await import(pathToFileURL(path.join(packageDirectory,"store.mjs")).href);
const backup=process.argv[2];if(!backup)throw new Error("请提供完整迁移备份文件");
const store=new LocalStore(path.join(process.env.LOCALAPPDATA,"QingyanStudy","data"));
try{console.log(JSON.stringify({imported:true,...await store.importBackup(await fs.readFile(backup))}));}finally{store.close();}
