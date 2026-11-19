import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {community} from '../cloudflare/community.js';

async function galleryModule(){
  const code=await readFile(new URL('../site/art-gallery.js',import.meta.url),'utf8');
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(code));
}

test('creation API paginates all drawings without leaking private data',async()=>{
  const drawings=Array.from({length:101},(_,i)=>({id:101-i,title:`Sketch ${101-i}`,topic:'light',stamp:'Day 3'}));
  const env={SITE_ORIGIN:'https://example.test',DB:{prepare(sql){
    assert.match(sql,/SELECT id,title,topic,created_at,stamp/);
    assert.doesNotMatch(sql,/SELECT \*/);
    return {bind(limit,offset){return {async all(){return {results:drawings.slice(offset,offset+limit)}}}}};
  }}};
  async function page(offset){
    const url=new URL(`https://worker.test/creations?offset=${offset}`);
    const r=await community(new Request(url),env,url,{});
    assert.equal(r.status,200);
    return r.json();
  }
  const a=await page(0),b=await page(40),c=await page(80);
  assert.equal(a.creations.length,40);assert.equal(a.nextOffset,40);
  assert.equal(b.creations.length,40);assert.equal(b.nextOffset,80);
  assert.equal(c.creations.length,21);assert.equal(c.nextOffset,null);
  assert.equal(new Set([...a.creations,...b.creations,...c.creations].map(x=>x.id)).size,101);
});

test('public website gathers every drawing from paginated Worker',async()=>{
  const {allRolloCreations}=await galleryModule();
  const drawings=Array.from({length:94},(_,i)=>({id:94-i,title:`Sketch ${94-i}`}));
  const requested=[];
  const fakeFetch=async url=>{
    const offset=Number(new URL(url).searchParams.get('offset'));
    requested.push(offset);
    const chunk=drawings.slice(offset,offset+40);
    return {ok:true,json:async()=>({creations:chunk,nextOffset:offset+40<drawings.length?offset+40:null})};
  };
  const received=await allRolloCreations('https://worker.test',fakeFetch);
  assert.equal(received.length,94);
  assert.deepEqual(requested,[0,40,80]);
});

test('public website safely handles older Workers that ignore offsets',async()=>{
  const {allRolloCreations}=await galleryModule();
  let calls=0;
  const oldWorker=async()=>{calls++;return {ok:true,json:async()=>({creations:[{id:1,title:'First sketch'}]})}};
  assert.deepEqual((await allRolloCreations('https://worker.test',oldWorker)).map(x=>x.id),[1]);
  assert.equal(calls,1);
});

test('shop displays the public drawings independently of optional sale links',async()=>{
  const shop=await readFile(new URL('../site/shop-ui.js',import.meta.url),'utf8');
  assert.match(shop,/for\(const art of creations\)/);
  assert.match(shop,/On display · Not for sale/);
  assert.match(shop,/if\(offer && typeof offer.checkout_url/);
  assert.doesNotMatch(shop,/\/owner\/shop/);
});
