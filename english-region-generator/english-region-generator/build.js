"use strict";
const fs=require("fs");
const files=fs.readdirSync("./src").filter(f=>f.endsWith(".js")).sort();
let bundle="";
for(const f of files)bundle+="/* ==== "+f+" ==== */\n"+fs.readFileSync("./src/"+f,"utf8")+"\n";
// safety: script-closing sequences inside the bundle would break the HTML
bundle=bundle.replace(/<\/script>/gi,"<\\/script>");
const shell=fs.readFileSync("./shell/shell.html","utf8");
const out=shell.replace("/*__BUNDLE__*/",()=>bundle);
fs.writeFileSync("./imaginary-county.html",out);
console.log("built imaginary-county.html",(out.length/1024).toFixed(0)+" KB");
