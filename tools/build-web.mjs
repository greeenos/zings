// Builds a static Vercel website, browser-local demo and optional connected app.
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, lstatSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const out = path.resolve('web-dist');
if (out !== path.join(process.cwd(),'web-dist')) throw new Error('Unexpected build directory');
if (existsSync(out) && lstatSync(out).isSymbolicLink()) throw new Error('Refusing to clean a symlinked output directory');
rmSync(out,{recursive:true,force:true});
mkdirSync(out,{recursive:true});
const pb = process.env.VITE_PB_URL || '';
if(pb && (!/^https:\/\//.test(pb) || new URL(pb).username || new URL(pb).password)) throw new Error('VITE_PB_URL must be a public HTTPS PocketBase URL without credentials.');
const vite = path.resolve('node_modules/vite/bin/vite.js');
function build(folder,demo) {
  execFileSync(process.execPath,[vite,'build','--base',`/${folder}/`,'--outDir',path.join(out,folder),'--emptyOutDir'],{stdio:'inherit',env:{...process.env,VITE_DEMO:demo?'1':'0'}});
  const index=path.join(out,folder,'index.html');let html=readFileSync(index,'utf8').replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>');
  if(demo) html=html.replace(/<script>\s*if \('serviceWorker'[\s\S]*?<\/script>/,'').replace(/<link rel="manifest"[^>]*>/,'');
  else {
    html=html.replace("register('/sw.js')","register('/app/sw.js')").replace('href="/manifest.json"','href="/app/manifest.json"');
    const manifest=JSON.parse(readFileSync('public/manifest.json','utf8'));
    for(const k of ['start_url','id','scope'])manifest[k]='/app/';
    manifest.shortcuts.forEach(s=>s.url='/app'+s.url);manifest.protocol_handlers.forEach(s=>s.url='/app'+s.url);manifest.share_target.action='/app/share-target';
    writeFileSync(path.join(out,folder,'manifest.json'),JSON.stringify(manifest,null,2));
    let sw=readFileSync('public/sw.js','utf8').replace("const VERSION = 'v15';","const VERSION = 'vercel-app-v1';");
    sw=sw.replace("fetch('/api/push/inbox'",`fetch(${JSON.stringify(pb.replace(/\/$/, '')+'/api/push/inbox')}`);
    sw=sw.replaceAll("'/share-target'","'/app/share-target'").replaceAll("'/'","'/app/'").replace('`/?${params.toString()}`','`/app/?${params.toString()}`');
    sw=sw.replace('if (windows.length > 0) return windows[0].focus();', "const appWindows = windows.filter(w => new URL(w.url).pathname.startsWith('/app/')); if (appWindows.length > 0) return appWindows[0].focus();");
    writeFileSync(path.join(out,folder,'sw.js'),sw);
  }
  writeFileSync(index,html);
}
build('demo',true);
if(pb)build('app',false);
else {mkdirSync(path.join(out,'app'),{recursive:true});writeFileSync(path.join(out,'app/index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zings</title><link rel="stylesheet" href="/site.css"><main class="wrap hero"><div class="eyebrow">ZINGS</div><h1 style="margin:30px 0">Make room for<br>what matters.</h1><p>Hosted Zings is coming soon. You can explore the demo now or run your own workspace.</p><div class="actions"><a class="button" href="/demo/">Try Zings ↗</a><a href="https://github.com/greeenos/zings#install">Run your own workspace ↗</a></div></main></html>`);}
cpSync('site',out,{recursive:true});
cpSync('media',path.join(out,'media'),{recursive:true});
for(const f of readdirSync('public')) if(!['sw.js','manifest.json'].includes(f))cpSync(path.join('public',f),path.join(out,f),{recursive:true});
const fonts='node_modules/@fontsource-variable/rubik/files';const font=readdirSync(fonts).find(f=>/^rubik-latin-wght-normal\.woff2$/.test(f));
if(!font)throw new Error('Rubik font not found');cpSync(path.join(fonts,font),path.join(out,'rubik-latin.woff2'));
const srt=readFileSync('media/zings-showreel.srt','utf8');writeFileSync(path.join(out,'media/zings-showreel.vtt'),'WEBVTT\n\n'+srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2'));
const base=process.env.SITE_URL;
if(base){const url=new URL(base);let html=readFileSync(path.join(out,'index.html'),'utf8');html=html.replace('content="/media/social-preview.png"',`content="${url.origin}/media/social-preview.png"`).replace('</head>',`<link rel="canonical" href="${url.origin}/"><meta property="og:url" content="${url.origin}/"></head>`);writeFileSync(path.join(out,'index.html'),html);writeFileSync(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`);writeFileSync(path.join(out,'sitemap.xml'),`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc></url></urlset>`);}
console.log('Website and isolated demo ready in web-dist'+(pb?'; connected app enabled.':'; configure VITE_PB_URL for the connected app.'));
