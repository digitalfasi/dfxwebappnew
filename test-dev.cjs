const { spawn } = require('child_process');
const p = spawn('npx', ['next','dev','-p','3002'], {cwd: __dirname, shell:true});
p.stdout.on('data',d=>process.stdout.write(d));
p.stderr.on('data',d=>process.stderr.write(d));
setTimeout(async()=>{
  try{
    const r=await fetch('http://localhost:3002');
    const t=await r.text();
    console.log('FETCH_STATUS',r.status);
    console.log(t.slice(0,3000));
    if(t.includes('__webpack_modules__')) console.log('WEBPACK_ERROR_DETECTED');
    if(t.includes('Aurum')) console.log('APP_RENDERED_OK');
  }catch(e){console.log('FETCH_ERR',e.message);}
  p.kill();
  setTimeout(()=>process.exit(0),1500);
}, 12000);
