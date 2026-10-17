// Decoded-audio transport for iPhone. Cache only the active asset.
export class BufferedTrack {
 constructor({context,destination,asset,ended=()=>{},beforeStart=()=>{},log=()=>{},changed=()=>{},budgetBytes=2.2e9}){Object.assign(this,{context,destination,asset,endedCallback:ended,beforeStart,log,changed,budgetBytes});this.track=null;this.buffer=null;this.key=null;this.pending=null;this.cache=new Map();this.inflight=new Map();this.wanted=[];this.warming=false;this.node=null;this.offset=0;this.startedAt=0;this.attempt=0;this.ended=false;}
 get duration(){return this.buffer?.duration??this.track?.duration??NaN;}
 get paused(){return !this.node;}
 get position(){return Math.min(this.duration||Infinity,this.offset+(this.node?Math.max(0,this.context().currentTime-this.startedAt):0));}
 pause(){const position=this.position;this.attempt++;const node=this.node;this.node=null;this.offset=Number.isFinite(position)?position:0;if(node){node.onended=null;try{node.stop();}catch{}node.disconnect();}this.log('buffer pause',{position:this.offset});}
 clear(){this.pause();this.track=null;this.buffer=null;this.pending=null;this.key=null;this.cache.clear();this.wanted=[];this.offset=0;this.ended=false;}
 load(track){this.pause();if(this.key!==track.assetId){if(this.buffer&&this.key)this.cache.set(this.key,this.buffer);this.buffer=null;this.pending=null;this.key=track.assetId;if(this.cache.has(track.assetId)){this.buffer=this.cache.get(track.assetId);this.cache.delete(track.assetId);this.log('buffer warm hit',{key:track.assetId});}}this.track=track;this.offset=0;this.ended=false;this.changed();}
 seek(position){this.pause();this.offset=Math.max(0,Math.min(position,Number.isFinite(this.duration)?Math.max(0,this.duration-.001):position));this.ended=false;}
 // One shared decode per asset (a warm-up in progress is reused, never repeated).
 decodeKey(key){
  if(this.inflight.has(key))return this.inflight.get(key);
  const ctx=this.context();
  const job=(async()=>{const t0=Date.now();const blob=await this.asset(key);if(!blob)throw Error('保存音源が見つかりません');const buffer=await ctx.decodeAudioData(await blob.arrayBuffer());this.log('buffer decoded',{ms:Date.now()-t0,key,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,decodedBytes:buffer.length*buffer.numberOfChannels*4});return buffer;})();
  this.inflight.set(key,job);const done=()=>{if(this.inflight.get(key)===job)this.inflight.delete(key);};job.then(done,done);return job;
 }
 async prepare(){
  if(!this.track)throw Error('音源を選択してください');if(this.buffer)return this.buffer;if(this.pending)return this.pending;
  const key=this.key;
  if(this.cache.has(key)){this.buffer=this.cache.get(key);this.cache.delete(key);return this.buffer;}
  const pending=this.decodeKey(key).then(buffer=>{if(this.key!==key)throw Error('音源が変更されました');this.buffer=buffer;this.changed();return buffer;});
  this.pending=pending;const clear=()=>{if(this.pending===pending)this.pending=null;};pending.then(clear,clear);return pending;
 }
 // Decode the songs that will probably play next (in order, one at a time) so switching never waits for decoding. Keeps only these in memory besides the active one.
 bytesOf(b){return b?b.length*b.numberOfChannels*4:0;}
 usedBytes(){let n=this.bytesOf(this.buffer);for(const b of this.cache.values())n+=this.bytesOf(b);return n;}
 isReady(key){return (key===this.key&&!!this.buffer)||this.cache.has(key);}
 isLoading(key){return this.inflight.has(key);}
 // Decode songs ahead, in the given priority order, one at a time, within a memory budget. Decoded songs stay available (also songs already played) so any jump is instant.
 warmMany(keys){
  this.wanted=keys.filter(k=>k&&k!==this.key);
  let used=this.bytesOf(this.buffer);
  for(const k of [...this.cache.keys()]){if(!this.wanted.includes(k))this.cache.delete(k);}
  for(const k of this.wanted){if(!this.cache.has(k))continue;used+=this.bytesOf(this.cache.get(k));if(used>this.budgetBytes)this.cache.delete(k);}
  if(this.warming)return;this.warming=true;const done=new Set();
  (async()=>{try{for(;;){const key=this.wanted.find(k=>!this.cache.has(k)&&!done.has(k));if(!key||this.usedBytes()>=this.budgetBytes)break;done.add(key);
   try{const buffer=await this.decodeKey(key);if(this.wanted.includes(key)&&this.key!==key&&this.usedBytes()<this.budgetBytes*1.2)this.cache.set(key,buffer);}catch(e){this.log('buffer warm failed',{message:e.message});}
   this.changed();}}finally{this.warming=false;this.changed();}})();
 }
 async play(){
  if(this.node)return this.startedAt;
  const attempt=++this.attempt,ctx=this.context(),t0=Date.now();await ctx.resume();const t1=Date.now();const buffer=await this.prepare();this.log('buffer play timing',{resumeMs:t1-t0,prepareMs:Date.now()-t1,ctx:ctx.state,baseLatency:ctx.baseLatency,outputLatency:ctx.outputLatency,sampleRate:ctx.sampleRate});if(attempt!==this.attempt)throw Error('再生準備が中止されました');if(ctx.state!=='running')throw Error('音声処理を開始できません');
  const node=ctx.createBufferSource();node.buffer=buffer;node.connect(this.destination());this.node=node;this.ended=false;this.startedAt=ctx.currentTime+.020;
  node.onended=()=>{if(this.node!==node)return;this.node=null;node.disconnect();this.offset=buffer.duration;this.ended=true;this.endedCallback();};
  try{this.beforeStart(this.startedAt);node.start(this.startedAt,this.offset);}catch(e){this.node=null;node.disconnect();throw e;}
  this.log('buffer start',{position:this.offset,scheduledAt:this.startedAt});return this.startedAt;
 }
}
