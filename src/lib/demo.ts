import type { Table } from './db';

export const isDemo = import.meta.env.VITE_DEMO === '1';
export const DEMO_KEY = 'zings-demo-workspace-v1';
type Row = { id: string; [key: string]: unknown };
type Workspace = Record<Table, Row[]>;
export const demoUser = { id: 'demouser0000001', collectionId: 'users', collectionName: 'users', email: 'maya@example.demo', name: 'Maya', calendars: [] };
export function demoToken() {
  return `${btoa(JSON.stringify({alg:'none'}))}.${btoa(JSON.stringify({exp: Math.floor(Date.now()/1000)+86400, id:demoUser.id}))}.demo`;
}
function seed(): Workspace {
  const date = (offset=0) => { const d=new Date(); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const createdAt = new Date().toISOString();
  const task = (id:string,title:string,extra:Record<string,unknown>={}) => ({id,title,createdAt,completed:false,list:'today',dueDate:date(),notes:'',checklist:[],tags:[],sortOrder:Number(id.replace(/\D/g,''))*1000,owner:demoUser.id,...extra});
  return {
    areas:[{id:'work',name:'Work',color:'#12be7f',sortOrder:1000,createdAt},{id:'personal',name:'Personal',color:'#8b5cf6',sortOrder:2000,createdAt}],
    projects:[{id:'launch',name:'Website relaunch',areaId:'work',color:'#12be7f',sortOrder:1000,createdAt,members:[]},{id:'lisbon',name:'Trip to Lisbon',areaId:'personal',color:'#8b5cf6',sortOrder:2000,createdAt,members:[]},{id:'home',name:'A little more room',areaId:'personal',color:'#d97706',sortOrder:3000,createdAt,members:[]}],
    headings:[{id:'design',projectId:'launch',name:'Design',sortOrder:1000,createdAt}],
    todos:[task('demo1','Review the homepage with Sam',{projectId:'launch',dueTime:'10:00',estimateMin:45,tags:['design']}),task('demo2','Record a short product demo',{projectId:'launch',notes:'Show the real app. Leave enough time to see each interaction.',checklist:[{id:'s1',text:'Plan the scenes',done:true},{id:'s2',text:'Record the walkthrough',done:false},{id:'s3',text:'Add captions',done:false}],priority:2,estimateMin:60}),task('demo3','Book a place to stay',{projectId:'lisbon',deadline:date(2),priority:3}),task('demo4','Call Mom',{evening:true,dueTime:'20:00',tags:['family']}),task('demo5','Pick up coffee beans',{list:'inbox',dueDate:null}),task('demo6','A thought for the next newsletter',{list:'inbox',dueDate:null}),task('demo7','Sketch a new desk layout',{projectId:'home',list:'anytime',dueDate:null}),task('demo8','Send the final design',{projectId:'launch',headingId:'design',list:'upcoming',dueDate:date(2)}),task('demo9','Pack for the trip',{projectId:'lisbon',list:'upcoming',dueDate:date(5)}),task('demo10','Learn a little Portuguese',{list:'someday',dueDate:null}),task('demo11','Read for twenty minutes',{repeatRule:{freq:'day',interval:1,from:'schedule'}}),task('demo12','Write the first draft',{list:'logbook',completed:true,completedAt:new Date(Date.now()-86400000).toISOString(),dueDate:date(-1),lastedMs:2700000,projectId:'launch'})]
  };
}
export function readDemo(): Workspace {
  try { const v=JSON.parse(localStorage.getItem(DEMO_KEY)||'null'); if(v && ['todos','projects','areas','headings'].every(k=>Array.isArray(v[k]))) return v; } catch { /* Seed unreadable storage. */ }
  return seed();
}
export function demoWrite(ops:Array<{table:Table;kind:string;id:string;body?:Record<string,unknown>}>): Error|null {
  try {
    const data=readDemo();
    for(const op of ops) {
      const at=data[op.table].findIndex(r=>r.id===op.id);
      if(op.kind==='delete') data[op.table]=data[op.table].filter(r=>r.id!==op.id);
      else if(at>=0) data[op.table][at]={...data[op.table][at],...op.body};
      else data[op.table].push({id:op.id,...op.body});
    }
    localStorage.setItem(DEMO_KEY,JSON.stringify(data));
    window.dispatchEvent(new Event('zings:demo-change'));
    return null;
  } catch { return new Error('Browser storage is full or unavailable.'); }
}
export function resetDemo() { localStorage.removeItem(DEMO_KEY); location.reload(); }
