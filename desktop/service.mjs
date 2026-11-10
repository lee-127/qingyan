import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
const app=path.dirname(fileURLToPath(import.meta.url));const home=path.dirname(app);
const logs=path.join(home,"logs");fs.mkdirSync(logs,{recursive:true});
const log=(message)=>fs.appendFileSync(path.join(logs,"service.log"),`${new Date().toISOString()} ${message}\n`);
console.error=(...values)=>log(values.map(String).join(" "));
for(let port=18766;port<18778;port++){
 const available=await new Promise(resolve=>{const probe=net.createServer();probe.once("error",()=>resolve(false));probe.listen(port,"127.0.0.1",()=>probe.close(()=>resolve(true)));});if(!available)continue;
 process.env.QINGYAN_PORT=String(port);process.env.QINGYAN_DATA_DIR=path.join(home,"data");
 const {server}=await import("./server.mjs");
 server.once("listening",()=>{const info={url:`http://127.0.0.1:${port}/`,pid:process.pid,version:"2.0.0",startedAt:new Date().toISOString(),managed:true};const target=path.join(home,"runtime.json");fs.writeFileSync(target+".tmp",JSON.stringify(info,null,2));fs.renameSync(target+".tmp",target);log("Local service ready");});
 break;
}
