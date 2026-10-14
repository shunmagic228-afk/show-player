// Decoded-audio transport for iPhone. Cache only the active asset.
export class BufferedTrack {
 constructor({context,destination,asset,ended=()=>{},beforeStart=()=>{},log=()=>{}}){Object.assign(this,{context,destination,asset,endedCallback:ended,beforeStart,log});this.track=null;this.buffer=null;this.key=null;this.pending=null;this.node=null;this.offset=0;this.startedAt=0;this.attempt=0;this.ended=false;}
 get duration(){return this.buffer?.duration??this.track?.duration??NaN;}
 get paused(){return !this.node;}
 get position(){return Math.min(this.duration||Infinity,this.offset+(this.node?Math.max(0,this.context().currentTime-this.startedAt):0));}
 pause(){const position=this.position;this.attempt++;const node=this.node;this.node=null;this.offset=Number.isFinite(position)?position:0;if(node){node.onended=null;try{node.stop();}catch{}node.disconnect();}this.log('buffer pause',{position:this.offset});}
 clear(){this.pause();this.track=null;this.buffer=null;this.pending=null;this.key=null;this.offset=0;this.ended=false;}
 load(track){this.pause();if(this.key!==track.assetId){this.buffer=null;this.pending=null;this.key=track.assetId;}this.track=track;this.offset=0;this.ended=false;}
 seek(position){this.pause();this.offset=Math.max(0,Math.min(position,Number.isFinite(this.duration)?Math.max(0,this.duration-.001):position));this.ended=false;}
 async prepare(){
  if(!this.track)throw Error('音源を選択してください');if(this.buffer)return this.buffer;if(this.pending)return this.pending;
  const key=this.key,ctx=this.context();
  this.pending=(async()=>{try{const blob=await this.asset(key);if(!blob)throw Error('保存音源が見つかりません');const bytes=await blob.arrayBuffer();const buffer=await ctx.decodeAudioData(bytes);if(this.key!==key)throw Error('音源が変更されました');this.buffer=buffer;this.log('buffer decoded',{duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,decodedBytes:buffer.length*buffer.numberOfChannels*4});return buffer;}finally{if(this.key===key)this.pending=null;}})();return this.pending;
 }
 async play(){
  if(this.node)return this.startedAt;
  const attempt=++this.attempt,ctx=this.context();await ctx.resume();const buffer=await this.prepare();if(attempt!==this.attempt)throw Error('再生準備が中止されました');if(ctx.state!=='running')throw Error('音声処理を開始できません');
  const node=ctx.createBufferSource();node.buffer=buffer;node.connect(this.destination());this.node=node;this.ended=false;this.startedAt=ctx.currentTime+.020;
  node.onended=()=>{if(this.node!==node)return;this.node=null;node.disconnect();this.offset=buffer.duration;this.ended=true;this.endedCallback();};
  try{this.beforeStart(this.startedAt);node.start(this.startedAt,this.offset);}catch(e){this.node=null;node.disconnect();throw e;}
  this.log('buffer start',{position:this.offset,scheduledAt:this.startedAt});return this.startedAt;
 }
}
