import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_KEY, readDemo, demoWrite } from './demo';
beforeEach(()=>localStorage.clear());
describe('browser demo storage',()=>{
  it('persists edits and deletes while leaving a real session alone',()=>{
    localStorage.setItem('pocketbase_auth','private-session');
    expect(demoWrite([{table:'todos',kind:'create',id:'local-test',body:{title:'My demo task'}}])).toBeNull();
    expect(demoWrite([{table:'todos',kind:'update',id:'local-test',body:{title:'Edited'}}])).toBeNull();
    expect(readDemo().todos.find(t=>t.id==='local-test')?.title).toBe('Edited');
    demoWrite([{table:'todos',kind:'delete',id:'local-test'}]);
    expect(readDemo().todos.some(t=>t.id==='local-test')).toBe(false);
    expect(localStorage.getItem('pocketbase_auth')).toBe('private-session');
  });
  it('recovers from malformed storage with a fictional workspace',()=>{
    localStorage.setItem(DEMO_KEY,'{"todos":null}');
    expect(readDemo().todos.length).toBeGreaterThan(0);
    expect(readDemo().projects.length).toBeGreaterThan(0);
  });
  it('reports a storage failure instead of pretending to save',()=>{
    const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('full');});
    try {expect(demoWrite([{table:'todos',kind:'create',id:'lost',body:{title:'Unsaved'}}])).toBeInstanceOf(Error);}
    finally {spy.mockRestore();}
  });
});
