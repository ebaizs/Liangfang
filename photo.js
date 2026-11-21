(()=>{
const root=document.getElementById('photoApp');
if(!root)return;
const $=id=>root.querySelector('#'+id)||document.getElementById(id), canvas=$('canvas'),ctx=canvas.getContext('2d');
const colors=['#f5e642','#ed3029','#2878f0','#32a852','#111111','#ffffff'];
let color='#ed3029',fontScale=1.2,arrowStyle=(window.LinuoBase?.getStorage('linuo_arrow_style','dot'))||'dot',lineStyle=(window.LinuoBase?.getStorage('linuo_line_style','dashed'))||'dashed',labelStyle=localStorage.getItem('linuo_label_style')||'white',photo=null,photoBaseData='',photoName='照片',dims=[],texts=[],history=[],redoStack=[],mode='idle',firstPoint=null,pendingDim=null,selected=-1,selectedText=-1,editingDimIndex=-1,textStart=null,livePoint=null,longPressTimer=null,longPressFired=false,photos=[],currentPhotoIndex=-1,view={scale:1,x:0,y:0},pointer=null;
if(labelStyle==='yellow')labelStyle='white';
const toast=m=>{const t=$('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2100)};

function sharedInput(){return window.LinuoSharedInput||null;}
function setKeyFromShared(value){
 const val=String(value??'0').slice(0,9)||'0';
 $('valueInput').value=val;
 if(pendingDim){pendingDim.value=val;render()}
 else if(editingDimIndex>=0&&dims[editingDimIndex]){dims[editingDimIndex].value=val;render()}
}
function openNumericKeyboard(initialValue='0'){
 const api=sharedInput();
 if(!api||typeof api.openNumericInput!=='function'){toast('量房共享数字键盘尚未就绪');return false;}
 setKeyFromShared(initialValue);
 return api.openNumericInput({
  value:String(initialValue??'0'),
  onInput:value=>setKeyFromShared(value),
  onConfirm:value=>{setKeyFromShared(value);confirmNumeric();closeNumericKeyboard();$('valueInput').blur();}
 });
}
function closeNumericKeyboard(){const api=sharedInput();if(api&&typeof api.closeNumericInput==='function')api.closeNumericInput();}
colors.forEach(c=>{const b=document.createElement('button');b.className='swatch'+(c===color?' active':'');b.dataset.color=c;b.style.background=c;b.onclick=()=>{color=c;root.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));b.classList.add('active');if(selected>=0){dims[selected].color=c;render()}else if(selectedText>=0&&texts[selectedText]){texts[selectedText].color=c;render();snapshot();}};$('colors').append(b)});
root.querySelectorAll('.fontbtn').forEach(b=>b.onclick=()=>{fontScale=+b.dataset.size;root.querySelectorAll('.fontbtn').forEach(x=>x.classList.toggle('active',x===b));if(selectedText>=0&&texts[selectedText]){snapshot();texts[selectedText].size=Math.max(18,canvas.width/55)*fontScale;}render()});

$('returnMeasureBtn').onclick=()=>{
 const api=sharedInput();if(api&&typeof api.closePhotoAnnotation==='function'){api.closePhotoAnnotation();return;}
 if(history.length>1)history.back();else toast('请使用浏览器返回按钮退出');
};
$('arrowStyle').value=arrowStyle;$('lineStyle').value=lineStyle;$('labelStyle').value=labelStyle;
$('arrowStyle').onchange=()=>{arrowStyle=$('arrowStyle').value;localStorage.setItem('linuo_arrow_style',arrowStyle);window.dispatchEvent(new CustomEvent('linuo-annotation-style-change'));render()};
$('lineStyle').onchange=()=>{lineStyle=$('lineStyle').value;localStorage.setItem('linuo_line_style',lineStyle);window.dispatchEvent(new CustomEvent('linuo-annotation-style-change'));render()};
$('labelStyle').onchange=()=>{labelStyle=$('labelStyle').value;localStorage.setItem('linuo_label_style',labelStyle);render()};
$('confirmAnnotationSettings').onclick=()=>{arrowStyle=$('arrowStyle').value;lineStyle=$('lineStyle').value;labelStyle=$('labelStyle').value;localStorage.setItem('linuo_arrow_style',arrowStyle);localStorage.setItem('linuo_line_style',lineStyle);localStorage.setItem('linuo_label_style',labelStyle);window.dispatchEvent(new CustomEvent('linuo-annotation-style-change'));toast('标注样式已保存')};

function snapshot(){history.push(JSON.stringify({dims,texts}));if(history.length>60)history.shift();redoStack=[]}
function restore(s){const o=JSON.parse(s);dims=o.dims;texts=o.texts;selected=-1;render()}
function resizeCanvas(){if(!photo)return;const stage=$('stage'),w=stage.clientWidth,h=stage.clientHeight;let s=Math.min(w/photo.width,h/photo.height);canvas.width=photo.width;canvas.height=photo.height;canvas.style.width=(photo.width*s)+'px';canvas.style.height=(photo.height*s)+'px';view={scale:1,x:0,y:0};applyView();render()}
function applyView(){canvas.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.scale})`;}
function render(){
 if(!photo)return;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 ctx.drawImage(photo,0,0);
 dims.forEach((d,i)=>drawDim(d,i===selected));
 if(pendingDim)drawDim(pendingDim,true);
 if(pointer?.kind==='drawSecond'&&firstPoint){
   drawDim({x1:firstPoint.x,y1:firstPoint.y,x2:pointer.current.x,y2:pointer.current.y,value:'',color,offset:0,textOffset:0},false);
 }
 if(pointer?.kind==='textLeader'&&textStart){
   const q=pointer.current;ctx.save();ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,canvas.width/900)*fontScale;ctx.setLineDash(lineStyle==='dashed'?[6*fontScale,4*fontScale]:[]);ctx.beginPath();ctx.moveTo(textStart.x,textStart.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.restore();
 }
 texts.forEach((t,i)=>drawTextItem(t,i===selectedText));
 $('valueBar').value=selected>=0?`${dims[selected].value}`:'—';
 if(currentPhotoIndex>=0&&photos[currentPhotoIndex]){
  photos[currentPhotoIndex].dims=JSON.parse(JSON.stringify(dims));
  photos[currentPhotoIndex].texts=JSON.parse(JSON.stringify(texts));
 }
}
function drawLabelPlate(x,y,text,fs,color,rotation=0){
 ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.font=`bold ${fs}px Arial,sans-serif`;
 const tw=ctx.measureText(text).width,pad=fs*.32,h=fs*1.45;
 const plate=labelStyle==='white'?'rgba(255,255,255,.82)':labelStyle==='blue'?'rgba(40,120,240,.72)':labelStyle==='black'?'rgba(0,0,0,.72)':'transparent';if(labelStyle!=='none'){ctx.fillStyle=plate;ctx.fillRect(-tw/2-pad,-h/2,tw+pad*2,h)}
 ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,0,0);ctx.restore();
}
function drawDim(d,sel){
 const dx=d.x2-d.x1,dy=d.y2-d.y1,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,offset=d.offset||0;
 const ax=d.x1+nx*offset,ay=d.y1+ny*offset,bx=d.x2+nx*offset,by=d.y2+ny*offset;
 const scale=fontScale,lineW=Math.max(.8,canvas.width/850)*scale;
 ctx.save();ctx.strokeStyle=d.color;ctx.fillStyle=d.color;ctx.lineWidth=lineW*(sel?1.25:1);
 ctx.setLineDash(lineStyle==='dashed'?[7*scale,5*scale]:[]);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);
 const head=Math.max(5,canvas.width/115)*scale,a=Math.atan2(by-ay,bx-ax);
 function endpoint(x,y,ang){
  if(arrowStyle==='arrow'){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-head*Math.cos(ang-.45),y-head*Math.sin(ang-.45));ctx.lineTo(x-head*Math.cos(ang+.45),y-head*Math.sin(ang+.45));ctx.closePath();ctx.fill()}
  else if(arrowStyle==='tick'){const tx=-Math.sin(ang),ty=Math.cos(ang);ctx.beginPath();ctx.moveTo(x-tx*head*.7,y-ty*head*.7);ctx.lineTo(x+tx*head*.7,y+ty*head*.7);ctx.stroke()}
  else{ctx.beginPath();ctx.arc(x,y,Math.max(2.5,head*.34),0,Math.PI*2);ctx.fill()}
 }
 endpoint(ax,ay,a+Math.PI);endpoint(bx,by,a);
 ctx.setLineDash(lineStyle==='dashed'?[7*scale,5*scale]:[]);ctx.beginPath();ctx.moveTo(d.x1,d.y1);ctx.lineTo(ax,ay);ctx.moveTo(d.x2,d.y2);ctx.lineTo(bx,by);ctx.stroke();ctx.setLineDash([]);
 const mx=(ax+bx)/2,my=(ay+by)/2,label=`${d.value??''}`,fs=Math.max(13,canvas.width/55)*scale,tx=mx+nx*(d.textOffset||0),ty=my+ny*(d.textOffset||0);
 let rot=a;if(rot>Math.PI/2||rot< -Math.PI/2)rot+=Math.PI;
 if(label)drawLabelPlate(tx,ty,label,fs,d.color,rot);
 if(sel){
  const rr=Math.max(8,canvas.width/115);
  for(const [hx,hy] of [[d.x1,d.y1],[d.x2,d.y2],[tx,ty]]){
   ctx.beginPath();ctx.arc(hx,hy,rr,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.82)';ctx.fill();ctx.lineWidth=Math.max(1.5,canvas.width/650);ctx.strokeStyle=d.color;ctx.stroke();
  }
 }
 ctx.restore();
}
function drawTextItem(t,sel){
 const fs=t.size||Math.max(18,canvas.width/55)*fontScale;
 ctx.save();
 if(Number.isFinite(t.anchorX)&&Number.isFinite(t.anchorY)){
   ctx.strokeStyle=t.color;ctx.lineWidth=Math.max(.8,canvas.width/850)*fontScale;ctx.setLineDash(lineStyle==='dashed'?[6*fontScale,4*fontScale]:[]);
   ctx.beginPath();ctx.moveTo(t.anchorX,t.anchorY);ctx.lineTo(t.x,t.y);ctx.stroke();
   ctx.beginPath();ctx.arc(t.anchorX,t.anchorY,Math.max(3,canvas.width/260),0,Math.PI*2);ctx.fillStyle=t.color;ctx.fill();
 }
 ctx.font=`bold ${fs}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
 const w=ctx.measureText(t.text).width,pad=fs*.35,h=fs*1.5;
 if(labelStyle!=='none'){ctx.fillStyle=labelStyle==='blue'?'rgba(40,120,240,.72)':labelStyle==='black'?'rgba(0,0,0,.72)':'rgba(255,255,255,.82)';ctx.fillRect(t.x-w/2-pad,t.y-h/2,w+pad*2,h)}
 ctx.fillStyle=t.color;ctx.fillText(t.text,t.x,t.y);
 if(sel){ctx.strokeStyle='#4d83f5';ctx.lineWidth=2;ctx.strokeRect(t.x-w/2-pad-3,t.y-h/2-3,w+2*pad+6,h+6)}
 ctx.restore();
}
function loadFile(file){if(!file)return Promise.resolve();cacheCurrentPhotoToGallery();closeNumericKeyboard();return new Promise(resolve=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{const scale=900/Math.max(1,img.naturalHeight),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=900,c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);photoBaseData=c.toDataURL('image/jpeg',.88);const compressed=new Image();compressed.onload=()=>{photo=compressed;photoName=file.name||'现场照片';dims=[];texts=[];history=[];redoStack=[];selected=-1;selectedText=-1;editingDimIndex=-1;pendingDim=null;firstPoint=null;textStart=null;pointer=null;hideMagnifier();$('empty').classList.add('hidden');canvas.classList.remove('hidden');$('hint').textContent=`照片已压缩至 ${w}×${h}；点击长度后选择两个端点`;resizeCanvas();addPhotoRecord();URL.revokeObjectURL(url);resolve()};compressed.onerror=()=>{URL.revokeObjectURL(url);toast('图片压缩失败');resolve()};compressed.src=photoBaseData};img.onerror=()=>{URL.revokeObjectURL(url);toast('图片读取失败');resolve()};img.src=url})}
function addPhotoRecord(){const data=exportData();photos.push({name:photoName,base:photoBaseData,data,thumb:data,dims:JSON.parse(JSON.stringify(dims)),texts:JSON.parse(JSON.stringify(texts))});currentPhotoIndex=photos.length-1;renderGallery()}
function cacheCurrentPhotoToGallery(){if(!photo||currentPhotoIndex<0||!photos[currentPhotoIndex])return false;try{const r=photos[currentPhotoIndex],data=exportData();r.name=photoName;r.base=photoBaseData||r.base;r.data=data;r.thumb=data;r.dims=JSON.parse(JSON.stringify(dims||[]));r.texts=JSON.parse(JSON.stringify(texts||[]));return true}catch(e){console.error('照片库缓存失败',e);return false}}
function exportData(){const c=document.createElement('canvas');c.width=photo.width;c.height=photo.height;const x=c.getContext('2d');x.drawImage(photo,0,0);dims.forEach((d,i)=>drawOnContext(x,d,i===selected,c.width));texts.forEach(t=>{const fs=t.size||24;x.font=`bold ${fs}px sans-serif`;x.textAlign='center';x.textBaseline='middle';const tw=x.measureText(t.text).width,p=fs*.35,hh=fs*1.5;if(Number.isFinite(t.anchorX)){x.strokeStyle=t.color;x.lineWidth=Math.max(1,c.width/850)*fontScale;x.setLineDash(lineStyle==='dashed'?[6*fontScale,4*fontScale]:[]);x.beginPath();x.moveTo(t.anchorX,t.anchorY);x.lineTo(t.x,t.y);x.stroke()}if(labelStyle!=='none'){x.fillStyle=labelStyle==='blue'?'rgba(40,120,240,.72)':labelStyle==='black'?'rgba(0,0,0,.72)':'rgba(255,255,255,.82)';x.fillRect(t.x-tw/2-p,t.y-hh/2,tw+2*p,hh)}x.fillStyle=t.color;x.fillText(t.text,t.x,t.y)});return c.toDataURL('image/jpeg',.94)}
function drawOnContext(x,d,sel,w){
 const dx=d.x2-d.x1,dy=d.y2-d.y1,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l,o=d.offset||0,ax=d.x1+nx*o,ay=d.y1+ny*o,bx=d.x2+nx*o,by=d.y2+ny*o;
 const scale=fontScale;x.save();x.strokeStyle=d.color;x.fillStyle=d.color;x.lineWidth=Math.max(.8,w/850)*scale;
 x.setLineDash(lineStyle==='dashed'?[7*scale,5*scale]:[]);x.beginPath();x.moveTo(ax,ay);x.lineTo(bx,by);x.stroke();x.setLineDash([]);
 const h=Math.max(5,w/115)*scale,a=Math.atan2(by-ay,bx-ax);
 function endpoint(px,py,ang){
  if(arrowStyle==='arrow'){x.beginPath();x.moveTo(px,py);x.lineTo(px-h*Math.cos(ang-.45),py-h*Math.sin(ang-.45));x.lineTo(px-h*Math.cos(ang+.45),py-h*Math.sin(ang+.45));x.closePath();x.fill()}
  else if(arrowStyle==='tick'){const tx=-Math.sin(ang),ty=Math.cos(ang);x.beginPath();x.moveTo(px-tx*h*.7,py-ty*h*.7);x.lineTo(px+tx*h*.7,py+ty*h*.7);x.stroke()}
  else{x.beginPath();x.arc(px,py,Math.max(2.5,h*.34),0,Math.PI*2);x.fill()}
 }
 endpoint(ax,ay,a+Math.PI);endpoint(bx,by,a);
 x.setLineDash(lineStyle==='dashed'?[7*scale,5*scale]:[]);x.beginPath();x.moveTo(d.x1,d.y1);x.lineTo(ax,ay);x.moveTo(d.x2,d.y2);x.lineTo(bx,by);x.stroke();x.setLineDash([]);
 const fs=Math.max(13,w/55)*scale,txt=String(d.value),tw=(x.measureText(txt).width||fs)*1.05,p=fs*.32,hh=fs*1.45,mx=(ax+bx)/2+nx*(d.textOffset||0),my=(ay+by)/2+ny*(d.textOffset||0);
 x.save();x.translate(mx,my);let r=a;if(r>Math.PI/2||r< -Math.PI/2)r+=Math.PI;x.rotate(r);x.font=`bold ${fs}px Arial`;
 if(labelStyle!=='none'){x.fillStyle=labelStyle==='blue'?'rgba(40,120,240,.72)':labelStyle==='black'?'rgba(0,0,0,.72)':'rgba(255,255,255,.78)';x.fillRect(-tw/2-p,-hh/2,tw+2*p,hh)}
 x.fillStyle=d.color;x.textAlign='center';x.textBaseline='middle';x.fillText(txt,0,0);x.restore();x.restore();
}
function loadPhotoFromRecord(index){
 const p=photos[index];if(!p)return toast('照片记录不存在');
 // 切换到另一张照片前，先把当前照片刚追加的标注合成回照片库，避免切换丢失。
 if(currentPhotoIndex>=0&&currentPhotoIndex!==index)cacheCurrentPhotoToGallery();
 // 优先读取未标注的原图，再把尺寸与文字作为可继续编辑的图层恢复。
 const rawSrc=p.base||p.raw||p.original||p.photo||'';
 const src=rawSrc||p.data||p.thumb;if(!src)return toast('照片数据为空，无法重新加载');
 const hasSeparateAnnotations=!!rawSrc;
 const im=new Image();
 im.onload=()=>{
  try{
   closeNumericKeyboard();
   photo=im;photoBaseData=rawSrc||src;photoName=p.name||'照片';currentPhotoIndex=index;
   // 老记录若只有合成图，则不重复叠加旧标注；仍可在该图片上继续增加新标记。
   dims=hasSeparateAnnotations?JSON.parse(JSON.stringify(p.dims||[])):[];
   texts=hasSeparateAnnotations?JSON.parse(JSON.stringify(p.texts||[])):[];
   mode='idle';firstPoint=null;pendingDim=null;selected=-1;selectedText=-1;editingDimIndex=-1;textStart=null;livePoint=null;pointer=null;
   history=[];redoStack=[];
   $('canvas').classList.remove('hidden');$('empty').classList.add('hidden');
   $('hint').textContent='已重新加载照片，可继续添加尺寸标注或文字标记';
   $('gallery').classList.remove('show');
   resizeCanvas();snapshot();render();toast('照片已加载，可继续添加尺寸或标记');
  }catch(err){console.error('照片库重新加载失败',err);toast('照片加载失败，请重新选择');}
 };
 im.onerror=()=>toast('照片读取失败，请重新选择');
 im.src=src;
}
function renderGallery(){
 const grid=$('galleryGrid');grid.innerHTML='';
 photos.forEach((p,i)=>{
  const card=document.createElement('div');card.className='thumb';card.dataset.index=String(i);card.title='点击重新加载并继续标注';
  const img=document.createElement('img');img.src=p.thumb||p.data||p.base||p.raw||p.original||p.photo;img.alt=p.name||`照片${i+1}`;
  const check=document.createElement('input');check.type='checkbox';check.className='photo-select';check.dataset.i=String(i);check.checked=true;
  const name=document.createElement('small');name.textContent=p.name||`照片${i+1}`;
  const del=document.createElement('button');del.type='button';del.className='photo-delete-btn';del.dataset.deletePhoto=String(i);del.textContent='删除';
  card.append(img,check,name,del);grid.append(card);
 });
}

function batch(){
 const checks=[...root.querySelectorAll('.photo-select:checked')];
 if(!checks.length)return toast('请先勾选需要导出的照片');
 const chosen=checks.map(c=>photos[Number(c.dataset.i)]).filter(Boolean);
 if(!chosen.length)return toast('没有可导出的照片');
 chosen.forEach((p,i)=>setTimeout(()=>downloadData(p.data||p.thumb||p.base,cleanName(p.name)+'_标注.jpg'),i*450));
 toast(`已开始导出 ${chosen.length} 张照片`);
}
$('openGallery').onclick=()=>{
 cacheCurrentPhotoToGallery();
 $('gallery').classList.add('show');renderGallery();
};
$('closeGallery').onclick=()=>$('gallery').classList.remove('show');
$('selectAll').onclick=()=>{
  const boxes=[...root.querySelectorAll('.photo-select')];
  const allChecked=boxes.length&&boxes.every(x=>x.checked);
  boxes.forEach(x=>x.checked=!allChecked);
  $('selectAll').textContent=allChecked?'全选':'取消全选';
};
$('galleryGrid').addEventListener('change',e=>{
 if(e.target.matches('.photo-select')){
  const boxes=[...root.querySelectorAll('.photo-select')];
  $('selectAll').textContent=boxes.length&&boxes.every(x=>x.checked)?'取消全选':'全选';
 }
});
$('galleryGrid').addEventListener('click',e=>{
 const btn=e.target.closest('[data-delete-photo]');
 if(btn){
  const i=Number(btn.dataset.deletePhoto);if(!Number.isInteger(i)||!photos[i])return;
  if(!confirm(`确定删除“${photos[i].name||'这张照片'}”吗？`))return;
  photos.splice(i,1);
  if(currentPhotoIndex===i){currentPhotoIndex=-1;photo=null;photoBaseData='';dims=[];texts=[];$('canvas').classList.add('hidden');$('empty').classList.remove('hidden');}
  else if(currentPhotoIndex>i)currentPhotoIndex--;
  renderGallery();toast('照片已从照片库删除');return;
 }
 if(e.target.closest('.photo-select'))return;
 const card=e.target.closest('.thumb');if(!card)return;
 loadPhotoFromRecord(Number(card.dataset.index));
});
$('batchSave').onclick=batch;
$('deleteSelected').onclick=()=>{const ids=[...root.querySelectorAll('.photo-select:checked')].map(x=>Number(x.dataset.i)).sort((a,b)=>b-a);if(!ids.length)return toast('请先勾选要删除的照片');if(!confirm(`确定删除选中的 ${ids.length} 张照片吗？`))return;ids.forEach(i=>photos.splice(i,1));currentPhotoIndex=-1;photo=null;photoBaseData='';dims=[];texts=[];$('canvas').classList.add('hidden');$('empty').classList.remove('hidden');renderGallery();toast(`已删除 ${ids.length} 张照片`);};
let activeCameraStream=null,cameraDevices=[],selectedCameraId='',defaultCameraId=localStorage.getItem('linuo_default_camera_id')||'';
async function stopCameraPreview(){if(activeCameraStream){activeCameraStream.getTracks().forEach(t=>t.stop());activeCameraStream=null}$('cameraVideo').srcObject=null}
window.addEventListener('pagehide',()=>{if(activeCameraStream){activeCameraStream.getTracks().forEach(t=>t.stop());activeCameraStream=null}});
function renderCameraChoiceButtons(){
 const holder=$('cameraChoiceButtons');if(!holder)return;
 holder.innerHTML='';
 if(!cameraDevices.length){holder.textContent='未检测到可用镜头';return}
 cameraDevices.forEach((device,index)=>{
  const button=document.createElement('button');button.type='button';
  button.className='camera-choice-btn'+(device.deviceId===selectedCameraId?' active':'');
  button.textContent=String(index+1);button.title=device.label||`摄像头 ${index+1}`;
  button.setAttribute('aria-label',`选择镜头 ${index+1}：${device.label||'摄像头'}`);
  button.onclick=()=>changeCamera(device.deviceId);
  holder.appendChild(button);
 });
}
async function enumerateCameraChoices(){
 if(!navigator.mediaDevices?.getUserMedia){toast('当前浏览器不支持网页摄像头选择');return}
 try{
  if(!activeCameraStream)activeCameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const all=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
  const saved=all.find(d=>d.deviceId===defaultCameraId);
  const current=activeCameraStream?.getVideoTracks?.()[0]?.getSettings?.()?.deviceId;
  const rearMain=all.find(d=>d.deviceId!==saved?.deviceId&&/(back|rear|environment|后置|主摄|1x|广角)/i.test(d.label||''));
  const systemMain=rearMain||(current&&current!==saved?.deviceId?all.find(d=>d.deviceId===current):null);
  cameraDevices=[saved,systemMain,...all.filter(d=>d!==saved&&d!==systemMain)].filter(Boolean);
  if(!cameraDevices.length)cameraDevices=all;
  if(!cameraDevices.some(d=>d.deviceId===selectedCameraId))selectedCameraId=(saved||systemMain||cameraDevices[0]||{}).deviceId||current||'';
  renderCameraChoiceButtons();
  $('cameraVideo').srcObject=activeCameraStream;await $('cameraVideo').play().catch(()=>{});
 }catch(err){toast('无法读取摄像头列表：'+(err.message||err))}
}
async function openCameraSettings(){
 $('cameraModal').classList.add('show');$('cameraModal').querySelector('.camera-head b').textContent='设置 · 镜头与标注样式';
 $('saveCamera').style.display='';$('captureCamera').style.display='none';$('cameraChoiceButtons').style.display='flex';$('switchCamera').style.display='';$('annotationSettings').classList.remove('hidden');
 $('cameraHelp').textContent='点击数字按钮切换镜头；当前选中的镜头可设为默认镜头。不同手机开放的镜头数量不同。';
 await enumerateCameraChoices();
 if(selectedCameraId)await changeCamera(selectedCameraId);
}
async function changeCamera(id=selectedCameraId){
 if(!id)return;
 selectedCameraId=id;renderCameraChoiceButtons();await stopCameraPreview();
 try{
  activeCameraStream=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:id}},audio:false});
  $('cameraVideo').srcObject=activeCameraStream;await $('cameraVideo').play();
 }catch(e){toast('该镜头无法预览：'+e.message);await enumerateCameraChoices()}
}
$('closeCamera').onclick=async()=>{$('cameraModal').classList.remove('show');await stopCameraPreview()};
$('switchCamera').onclick=()=>{
 if(cameraDevices.length>1){const ix=cameraDevices.findIndex(d=>d.deviceId===selectedCameraId);changeCamera(cameraDevices[(ix+1+cameraDevices.length)%cameraDevices.length].deviceId)}
 else toast('浏览器只提供一个摄像头入口');
};
$('saveCamera').onclick=async()=>{
 const chosen=selectedCameraId;if(!chosen)return toast('请先选择镜头');
 defaultCameraId=chosen;localStorage.setItem('linuo_default_camera_id',defaultCameraId);
 await changeCamera(chosen);await enumerateCameraChoices();toast('默认镜头已保存；下次拍照优先调用');
};
$('settingsBtn').onclick=openCameraSettings;
async function openCameraPicker(){
 if(!navigator.mediaDevices?.getUserMedia){$('cameraInput').click();return}
 try{
  await stopCameraPreview();
  const constraints=defaultCameraId?{deviceId:{exact:defaultCameraId}}:{facingMode:{ideal:'environment'}};
  activeCameraStream=await navigator.mediaDevices.getUserMedia({video:constraints,audio:false});
  const v=$('cameraVideo');v.srcObject=activeCameraStream;await v.play();
  const track=activeCameraStream.getVideoTracks()[0],settings=track.getSettings();
  selectedCameraId=settings.deviceId||selectedCameraId;
  if(defaultCameraId&&settings.deviceId!==defaultCameraId){toast('默认镜头不可用，已改用系统后置镜头');defaultCameraId='';localStorage.removeItem('linuo_default_camera_id')}
  $('cameraModal').classList.add('show');$('cameraModal').querySelector('.camera-head b').textContent='拍摄照片';
  $('saveCamera').style.display='none';$('captureCamera').style.display='';$('cameraChoiceButtons').style.display='none';$('switchCamera').style.display='none';$('annotationSettings').classList.add('hidden');$('cameraHelp').textContent='正在使用设置中保存的默认镜头。';
  await enumerateCameraChoices();
 }catch(err){toast('无法调用所选镜头：'+(err.message||err));await stopCameraPreview();$('cameraInput').click()}
}
$('captureCamera').onclick=async()=>{
 const v=$('cameraVideo');if(!v.videoWidth)return toast('相机尚未准备好');
 const c=document.createElement('canvas'),sc=Math.min(1,1200/Math.max(v.videoWidth,v.videoHeight));
 c.width=Math.round(v.videoWidth*sc);c.height=Math.round(v.videoHeight*sc);c.getContext('2d').drawImage(v,0,0,c.width,c.height);
 const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.88));const f=new File([blob],`现场照片_${Date.now()}.jpg`,{type:'image/jpeg'});
 $('cameraModal').classList.remove('show');await stopCameraPreview();await loadFile(f);
};
$('cameraBtn').onclick=()=>openCameraPicker();
// 文件选择必须在用户点击事件中同步触发；清空 value 可保证重复选择同一张照片也会触发 change。
$('albumBtn').type='button';$('albumBtn').onclick=e=>{e.preventDefault();e.stopPropagation();const input=$('albumInput');if(!input)return toast('相册选择控件未加载');input.value='';try{input.click()}catch(err){toast('无法打开相册：'+(err.message||err))}};
$('cameraInput').onchange=e=>loadFile(e.target.files[0]);
if($('albumInput'))$('albumInput').onchange=async e=>{const files=[...e.target.files];e.target.value='';if(!files.length)return;toast(`正在读取 ${files.length} 张照片…`);for(const f of files)await loadFile(f);};
function cleanName(n){return (n||'照片').replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_')}

function dataURLtoBlob(data){
 const arr=String(data).split(',');
 const mime=(arr[0].match(/:(.*?);/)||[])[1]||'image/jpeg';
 const bstr=atob(arr[1]||'');
 const u8=new Uint8Array(bstr.length);
 for(let i=0;i<bstr.length;i++)u8[i]=bstr.charCodeAt(i);
 return new Blob([u8],{type:mime});
}

function downloadData(data,name){
 try{
  let url=data,revoke=null;
  if(String(data).startsWith('data:')){
   url=URL.createObjectURL(dataURLtoBlob(data));
   revoke=url;
  }
  const a=document.createElement('a');
  a.href=url;a.download=name;a.rel='noopener';a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();
  if(revoke)setTimeout(()=>URL.revokeObjectURL(revoke),8000);
  return true;
 }catch(e){toast('下载失败：'+(e.message||e));return false}
}

function saveCurrent(){
 if(!photo)return toast('请先拍照或从相册选择照片');
 let data;
 try{data=exportData()}catch(e){return toast('生成图片失败：'+(e.message||e))}
 if(currentPhotoIndex>=0&&photos[currentPhotoIndex]){
  photos[currentPhotoIndex].data=data;
  photos[currentPhotoIndex].thumb=data;
  photos[currentPhotoIndex].dims=JSON.parse(JSON.stringify(dims));
 }
 const name=cleanName(photoName)+'_标注.jpg';
 if(downloadData(data,name))toast('已开始下载：'+name);
}
$('saveBtn').onclick=saveCurrent;
$('drawBtn').onclick=()=>{if(!photo)return toast('请先拍照或从相册选择照片');closeNumericKeyboard();mode='draw';pendingDim=null;firstPoint=null;pointer=null;editingDimIndex=-1;hideMagnifier();$('drawBtn').classList.add('active');$('panBtn').classList.remove('active');$('editBtn').classList.remove('active');$('editPanel').classList.remove('show');$('hint').textContent='长度标注：点取第一点，再按住拖动至第二点，松开后输入数值';toast('长度标注已启动：选择第一点');};
$('panBtn').onclick=()=>{closeNumericKeyboard();mode='pan';hideMagnifier();$('panBtn').classList.add('active');$('drawBtn').classList.remove('active');$('editBtn').classList.remove('active');$('hint').textContent='移动模式：可拖动照片查看';};
$('editBtn').onclick=()=>{
 closeNumericKeyboard();
 if(!photo)return toast('请先拍照或从相册选择照片');
 if(pendingDim){
  pendingDim=null;firstPoint=null;pointer=null;mode='idle';
  
  hideMagnifier();render();toast('已取消当前未确认的尺寸');return;
 }
 if(selected<0&&selectedText<0){
  mode='idle';pointer=null;hideMagnifier();
  $('drawBtn').classList.remove('active');$('panBtn').classList.remove('active');
  $('editPanel').classList.remove('show');
  $('hint').textContent='点击照片上的尺寸线或文字选中，再点“删除”即可移除';
  render();toast('请先点击选中要删除的标注');return;
 }
 snapshot();
 if(selectedText>=0){texts.splice(selectedText,1);selectedText=-1}
 if(selected>=0){dims.splice(selected,1);selected=-1}
 editingDimIndex=-1;pointer=null;hideMagnifier();
 
 $('hint').textContent='已删除选中标注；可继续点击其它标注删除，或点“长度”添加新尺寸';
 render();toast('已删除选中标注');
};
$('centerBtn').onclick=()=>{if(!photo)return toast('请先选择照片');view={scale:1,x:0,y:0};resizeCanvas();canvas.style.transform='translate(0px, 0px) scale(1)';toast('照片已适配画布并居中显示')};
function pos(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function setKey(v){
 const val=String(v||'').slice(0,9)||'0';
 $('valueInput').value=val;
 if(pendingDim){pendingDim.value=val;render()}
 else if(editingDimIndex>=0&&dims[editingDimIndex]){dims[editingDimIndex].value=val;render()}
}
function confirmNumeric(){
 if(pendingDim){
  snapshot();pendingDim.value=$('valueInput').value||pendingDim.value||'0';dims.push(pendingDim);selected=dims.length-1;selectedText=-1;pendingDim=null;firstPoint=null;mode='idle';$('drawBtn').classList.remove('active');render();hideMagnifier();$('hint').textContent='本条尺寸已确认。点击“长度”命令可添加下一条';closeNumericKeyboard();toast('尺寸已确认');
 }else if(editingDimIndex>=0){editingDimIndex=-1;render();closeNumericKeyboard();toast('尺寸文字已更新')}
 else toast('请先选择尺寸线的两个端点');
}
function showMagnifier(p){
 const m=$('magnifier'),mx=m.getContext('2d'),src=46;
 m.style.display='block';mx.clearRect(0,0,220,220);
 const sx=Math.max(0,Math.min(canvas.width-src,p.x-src/2)),sy=Math.max(0,Math.min(canvas.height-src,p.y-src/2));
 mx.drawImage(canvas,sx,sy,src,src,0,0,220,220);
 mx.strokeStyle='#ef3c9b';mx.lineWidth=3;mx.beginPath();mx.moveTo(110,0);mx.lineTo(110,220);mx.moveTo(0,110);mx.lineTo(220,110);mx.stroke();
 mx.beginPath();mx.arc(110,110,8,0,Math.PI*2);mx.stroke();
}
function hideMagnifier(){$('magnifier').style.display='none'}
function openDimValueEditor(index){
 if(index<0||!dims[index])return;
 snapshot();selected=index;editingDimIndex=index;setKey(String(dims[index].value));
 openNumericKeyboard(String(dims[index].value));
 $('hint').textContent='正在编辑尺寸文字：输入数字后点击确认';
 render();
}
async function openTextEditor(index){
 if(index<0||!texts[index])return;
 const value=window.LinuoDialog?await window.LinuoDialog.input('编辑文字内容','请输入标注文字',texts[index].text):null;
 if(value===null)return;
 snapshot();texts[index].text=value;selectedText=index;render();
}
function pos(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function nearestDimHandle(p){
 let hit=-1,handle=-1,best=Infinity;
 dims.forEach((d,i)=>{
  const dx=d.x2-d.x1,dy=d.y2-d.y1,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
  const mx=(d.x1+d.x2)/2+nx*(d.textOffset||0),my=(d.y1+d.y2)/2+ny*(d.textOffset||0);
  [[d.x1,d.y1,0],[d.x2,d.y2,1],[mx,my,2]].forEach(([x,y,j])=>{const dist=Math.hypot(p.x-x,p.y-y);if(dist<best){best=dist;hit=i;handle=j}});
 });
 return {hit,handle,best};
}
function nearestText(p){
 let hit=-1,best=Infinity;
 texts.forEach((t,i)=>{const fs=t.size||24,w=Math.max(fs*2,ctx.measureText(t.text).width+fs),d=Math.hypot(p.x-t.x,p.y-t.y);if(d<best&&d<Math.max(32,w*.65)){best=d;hit=i}});
 return hit;
}
canvas.addEventListener('pointerdown',e=>{
 if(!photo)return;
 const p=pos(e);
 if(mode==='pan'){pointer={kind:'pan',x:e.clientX,y:e.clientY,ox:view.x,oy:view.y};canvas.setPointerCapture(e.pointerId);return}
 if(mode==='draw'){
   if(pendingDim){
     pendingDim.x2=p.x;pendingDim.y2=p.y;
     pointer={kind:'drawSecond',current:p,fromPending:true};livePoint=p;
     canvas.setPointerCapture(e.pointerId);
     $('hint').textContent='已放下第二点：点击或拖动可调整第二点位置，确认数值后完成标注';
     render();showMagnifier(p);return;
   }
   if(!firstPoint){
     firstPoint=p;livePoint=p;$('hint').textContent='第一点已确定：按住并拖动选择第二点，右上角放大镜辅助定位，松开完成';
     showMagnifier(p);return;
   }
   pointer={kind:'drawSecond',current:p};livePoint=p;canvas.setPointerCapture(e.pointerId);render();showMagnifier(p);return;
 }
 if(mode==='text'){
   textStart=p;pointer={kind:'textLeader',current:p};canvas.setPointerCapture(e.pointerId);
   $('hint').textContent='拖动设置引线方向和文字位置，松开后输入文字';showMagnifier(p);return;
 }
 const textHit=nearestText(p);
 if(textHit>=0){
   selectedText=textHit;pointer={kind:'textHold',index:textHit,start:p,last:p,moved:false,snapshotTaken:false};
   longPressFired=false;
   longPressTimer=setTimeout(()=>{if(pointer?.kind==='textHold'&&!pointer.moved){longPressFired=true;pointer=null;openTextEditor(textHit)}},560);
   render();canvas.setPointerCapture(e.pointerId);return;
 }
 const {hit,handle,best}=nearestDimHandle(p);
 const handleLimit=Math.max(28,canvas.width*.035);
 if(hit>=0&&best<handleLimit){
   selected=hit;selectedText=-1;pointer={kind:handle===2?'dimLabelHold':'handle',index:hit,handle,start:p,last:p,moved:false,snapshotTaken:false};
   longPressFired=false;
   if(handle===2){
     longPressTimer=setTimeout(()=>{if(pointer?.kind==='dimLabelHold'&&!pointer.moved){longPressFired=true;pointer=null;openDimValueEditor(hit)}},560);
   }
   canvas.setPointerCapture(e.pointerId);render();return;
 }
 let lineHit=-1,lineBest=Infinity;
 dims.forEach((d,i)=>{const dx=d.x2-d.x1,dy=d.y2-d.y1,t=Math.max(0,Math.min(1,((p.x-d.x1)*dx+(p.y-d.y1)*dy)/(dx*dx+dy*dy||1))),dd=Math.hypot(p.x-d.x1-t*dx,p.y-d.y1-t*dy);if(dd<lineBest){lineBest=dd;lineHit=i}});
 selected=lineBest<canvas.width*.035?lineHit:-1;selectedText=-1;render();
});
canvas.addEventListener('pointermove',e=>{
 if(!photo)return;
 const p=pos(e);
 if(pointer?.kind==='pan'){view.x=pointer.ox+(e.clientX-pointer.x);view.y=pointer.oy+(e.clientY-pointer.y);applyView();return}
 if(pointer?.kind==='drawSecond'){
   pointer.current=p;livePoint=p;
   if(pointer.fromPending&&pendingDim){pendingDim.x2=p.x;pendingDim.y2=p.y}
   render();showMagnifier(p);return;
 }
 if(pointer?.kind==='textLeader'){
   pointer.current=p;render();showMagnifier(p);return;
 }
 if(pointer?.kind==='textHold'||pointer?.kind==='dimLabelHold'||pointer?.kind==='handle'){
   const moved=Math.hypot(p.x-pointer.start.x,p.y-pointer.start.y);
   if(moved>Math.max(5,canvas.width*.004)){
     pointer.moved=true;
     if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null}
     if(!pointer.snapshotTaken){snapshot();pointer.snapshotTaken=true}
     if(pointer.kind==='textHold'){
       const t=texts[pointer.index];t.x=p.x;t.y=p.y;pointer.last=p;render();showMagnifier(p);return;
     }
     const d=dims[pointer.index];
     if(pointer.handle===0){d.x1=p.x;d.y1=p.y}
     else if(pointer.handle===1){d.x2=p.x;d.y2=p.y}
     else{
       const dx=d.x2-d.x1,dy=d.y2-d.y1,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
       d.textOffset=(p.x-(d.x1+d.x2)/2)*nx+(p.y-(d.y1+d.y2)/2)*ny;
     }
     pointer.last=p;render();showMagnifier(p);
   }
 }
});
canvas.addEventListener('pointerup',async e=>{
 const p=pos(e),old=pointer;
 if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null}
 if(old?.kind==='drawSecond'){
   if(old.fromPending){
     pendingDim.x2=p.x;pendingDim.y2=p.y;pointer=null;
     render();showMagnifier(p);return;
   }
   pendingDim={x1:firstPoint.x,y1:firstPoint.y,x2:p.x,y2:p.y,value:'0',color,offset:0,textOffset:0};
   firstPoint=null;pointer=null;$('valueInput').value='0';
   $('hint').textContent='输入数值后点击确认；确认前再次点击照片可调整第二点';render();showMagnifier(p);openNumericKeyboard('0');return;
 }
 if(old?.kind==='textLeader'){
   const end=old.current||p;pointer=null;hideMagnifier();
   const value=window.LinuoDialog?await window.LinuoDialog.input('添加文字标注','请输入标注文字',''):null;
   if(value&&value.trim()){
     snapshot();texts.push({text:value.trim(),x:end.x,y:end.y,anchorX:textStart.x,anchorY:textStart.y,color,size:Math.max(18,canvas.width/55)*fontScale});
     selectedText=texts.length-1;render();toast('文字标注已添加');
   }
   textStart=null;mode='idle';$('editBtn').classList.remove('active');$('hint').textContent='文字已完成。再次点击“文字”命令可添加下一条';return;
 }
 if(old?.kind==='textHold'&&!old.moved&&!longPressFired){selectedText=old.index;selected=-1;render()}
 if(old?.kind==='dimLabelHold'&&!old.moved&&!longPressFired){selected=old.index;render()}
 pointer=null;
});
canvas.addEventListener('pointercancel',()=>{if(longPressTimer)clearTimeout(longPressTimer);longPressTimer=null;pointer=null});
$('stage').addEventListener('wheel',e=>{if(!photo)return;e.preventDefault();view.scale=Math.max(1,Math.min(4,view.scale*(e.deltaY<0?1.08:.92)));applyView()},{passive:false});
// 点击当前尺寸输入框，调用量房公用数字键盘
$('valueBar').addEventListener('click',()=>{

  if(!photo){
    return toast('请先拍照或选择照片');
  }

  if(selected<0 || !dims[selected]){
    return toast('请先点击照片上的尺寸标注');
  }

  // 打开当前选中尺寸的数字编辑器
  openDimValueEditor(selected);

});
$('applyValue').onclick=()=>{if(selected<0)return toast('请先选择一条尺寸线');snapshot();dims[selected].value=$('valueInput').value||'0';render()};
$('deleteDim').onclick=()=>{if(selected<0)return toast('请先选择尺寸线');snapshot();dims.splice(selected,1);selected=-1;render()};
$('clearDims').onclick=()=>{if(!dims.length&&!texts.length)return toast('当前没有标注');if(!confirm('确定清空当前照片的全部尺寸和文字标注吗？'))return;snapshot();dims=[];texts=[];selected=-1;pendingDim=null;firstPoint=null;render();toast('已清空全部标注')};
const photoUndo=$('photoUndo'),photoRedo=$('photoRedo');
if(photoUndo)photoUndo.onclick=e=>{e.preventDefault();e.stopPropagation();if(!history.length)return toast('没有可撤销的标注');redoStack.push(JSON.stringify({dims,texts}));restore(history.pop());};
if(photoRedo)photoRedo.onclick=e=>{e.preventDefault();e.stopPropagation();if(!redoStack.length)return toast('没有可恢复的标注');history.push(JSON.stringify({dims,texts}));restore(redoStack.pop());};
$('addText').onclick=()=>{if(!photo)return toast('请先拍照或从相册选择照片');closeNumericKeyboard();mode='text';textStart=null;pointer=null;selectedText=-1;$('drawBtn').classList.remove('active');$('panBtn').classList.remove('active');$('editBtn').classList.remove('active');$('editPanel').classList.remove('show');$('hint').textContent='文字标注：按住照片上的引线起点并拖动，松开后输入文字';toast('文字工具已启动：拖动设置引线');};
$('btConnect').onclick=()=>{
 const api=sharedInput();
 if(!api||typeof api.connectBluetooth!=='function')return toast('量房蓝牙共享服务尚未就绪');
 api.connectBluetooth().catch(err=>toast('蓝牙连接失败：'+(err.message||err)));
};
const sharedApi=sharedInput();
if(sharedApi&&typeof sharedApi.subscribeBluetoothState==='function'){
 sharedApi.subscribeBluetoothState(connected=>{
  const button=$('btConnect');if(!button)return;
  button.classList.toggle('bt-connected',!!connected);
  button.setAttribute('aria-pressed',connected?'true':'false');
  button.title=connected?'蓝牙已连接':'连接蓝牙测距仪';
 });
}
window.addEventListener('resize',()=>{if(photo&&root.closest('#photoAnnotationOverlay')?.classList.contains('open'))resizeCanvas()});

function resetSession(){
 closeNumericKeyboard();
 if(activeCameraStream){activeCameraStream.getTracks().forEach(t=>t.stop());activeCameraStream=null;}
 $('cameraVideo').srcObject=null;
 photo=null;photoBaseData='';photoName='照片';dims=[];texts=[];history=[];redoStack=[];mode='idle';firstPoint=null;pendingDim=null;selected=-1;selectedText=-1;editingDimIndex=-1;textStart=null;livePoint=null;pointer=null;currentPhotoIndex=-1;view={scale:1,x:0,y:0};
 $('canvas').classList.add('hidden');$('empty').classList.remove('hidden');$('gallery').classList.remove('show');$('cameraModal').classList.remove('show');$('editPanel').classList.remove('show');$('hint').textContent='先拍照或选择照片';$('valueInput').value='';$('valueBar').value='—';$('drawBtn').classList.remove('active');$('panBtn').classList.remove('active');$('editBtn').classList.remove('active');$('magnifier').style.display='none';
 color='#ed3029';fontScale=1.2;arrowStyle=window.LinuoBase?.getStorage('linuo_arrow_style','dot')||'dot';lineStyle=window.LinuoBase?.getStorage('linuo_line_style','dashed')||'dashed';labelStyle=localStorage.getItem('linuo_label_style')||'white';
 root.querySelectorAll('.swatch').forEach(b=>b.classList.toggle('active',b.dataset.color===color));
 root.querySelectorAll('.fontbtn').forEach(b=>b.classList.toggle('active',Number(b.dataset.size)===1));
 $('arrowStyle').value=arrowStyle;$('lineStyle').value=lineStyle;$('labelStyle').value=labelStyle;
 $('cameraInput').value='';if($('albumInput'))$('albumInput').value='';
}
function openPage(){resetSession();root.closest('#photoAnnotationOverlay').classList.add('open');root.closest('#photoAnnotationOverlay').setAttribute('aria-hidden','false');setTimeout(()=>{const overlay=root.closest('#photoAnnotationOverlay');if(overlay&&overlay.classList.contains('open')){if(photo)resizeCanvas();}},40);}
function closePage(){cacheCurrentPhotoToGallery();closeNumericKeyboard();if(activeCameraStream){activeCameraStream.getTracks().forEach(t=>t.stop());activeCameraStream=null;}$('cameraVideo').srcObject=null;$('cameraModal').classList.remove('show');root.closest('#photoAnnotationOverlay').classList.remove('open');root.closest('#photoAnnotationOverlay').setAttribute('aria-hidden','true');}
window.LinuoPhotoAnnotation={open:openPage,close:closePage};

/* 底部工具图标支持向上滑动激活，行为与量房工具栏一致 */
(function enablePhotoToolSwipe(){
 const nav=document.querySelector('#photoApp .bottom');if(!nav)return;
 let start=null,suppressClick=false,internalClick=false;
 nav.querySelectorAll('.tool').forEach(btn=>{
  btn.addEventListener('touchstart',e=>{const q=e.touches&&e.touches[0];if(q)start={x:q.clientX,y:q.clientY,btn};},{passive:true});
  btn.addEventListener('touchend',e=>{
   if(!start)return;const q=e.changedTouches&&e.changedTouches[0],s=start;start=null;
   if(q&&s.y-q.clientY>28&&Math.abs(q.clientX-s.x)<70){
    suppressClick=true;internalClick=true;btn.click();internalClick=false;setTimeout(()=>suppressClick=false,450);
   }
  },{passive:true});
  btn.addEventListener('click',e=>{if(suppressClick&&!internalClick){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;}},true);
 });
})();

})();
