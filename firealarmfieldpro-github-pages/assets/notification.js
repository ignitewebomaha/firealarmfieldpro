'use strict';
// Reference data: Potter EH/HS/S wall manual Table A; System Sensor AVAG26602 (1/15),
// Sections 5–7; Potter CS/CHS ceiling manual Table A. Sparse ceiling steps are
// deliberately conservative; never interpolate or extrapolate these reference rows.
const WALL_REFERENCE=[
 [20,15,null],[28,30,null],[30,34,null],[40,60,15],[45,75,19],[50,94,30],
 [54,110,30],[55,115,30],[60,135,30],[63,150,37],[68,177,43],[70,184,60],
 [80,240,60],[90,304,95],[100,375,95],[110,455,135],[120,540,135],[130,635,185]
];
const CEILING_REFERENCE={10:[[20,15],[30,30],[40,60],[44,75],[50,95],[70,185]],20:[[20,30],[30,45],[50,95],[70,185]],30:[[20,55],[30,75],[50,95],[70,185]]};
function parseCandelaSettings(value){const tokens=value.trim().split(/[,;\s]+/).filter(Boolean);if(!tokens.length)throw Error('Enter at least one available candela setting.');const numbers=tokens.map(Number);if(numbers.some(n=>!Number.isFinite(n)||n<=0||n>10000))throw Error('Device settings must be positive candela values separated by commas.');return [...new Set(numbers)].sort((a,b)=>a-b);}
function nextSetting(required,settings){return settings.find(x=>x>=required)??null;}
function notificationPlan(v){
 const L=Number(v.length),W=Number(v.width);if(!Number.isFinite(L)||!Number.isFinite(W)||L<=0||W<=0||L>10000||W>10000)throw Error('Enter positive room dimensions no greater than 10,000 ft.');
 const result={mode:v.mode,length:L,width:W,positions:[],warnings:[]};
 if(v.mode==='corridor'){
  if(W>20)throw Error('This corridor reference applies to widths up to 20 ft. Switch to room mode for wider spaces.');
  const count=L<=30?1:Math.ceil((L-30)/100)+1;
  result.count=count;result.required=15;result.setting=15;result.positions=count===1?[{x:L/2,y:0}]:Array.from({length:count},(_,i)=>({x:15+i*(L-30)/(count-1),y:0}));
  result.interval=count===1?0:(L-30)/(count-1);result.endDistance=count===1?L/2:15;
  result.method='Straight corridor · wall-mounted';result.warnings.push('No turns, intersections, obstructions, or sleeping areas. A higher candela does not extend this corridor spacing.');
 }else{
  const settings=parseCandelaSettings(v.settings);result.settings=settings;
  if(v.mode==='wall'){
   const four=v.layout==='four',D=Math.max(L,W);const row=WALL_REFERENCE.find(x=>x[0]>=D);if(!row)throw Error('Room exceeds the 130 ft wall-reference range. Subdivide the design or use a reviewed alternative.');
   if(four&&D<=30)throw Error('The four-wall reference is not available for this room size. Use a single-wall arrangement.');
   const col=four?2:1;result.required=row[col];if(result.required===null)throw Error('This arrangement has no reference value for the selected room.');
   result.setting=nextSetting(result.required,settings);result.count=four?4:1;result.lookupSize=row[0];result.sizingDimension=D;
   result.positions=four?[{x:L/2,y:0},{x:L,y:W/2},{x:L/2,y:W},{x:0,y:W/2}]:(L>=W?[{x:L/2,y:0}]:[{x:0,y:W/2}]);
   result.method=four?'Four wall strobes · centered, one per wall':'Single wall strobe · centered on long wall';
   result.alternatives=[{name:'One wall strobe',count:1,required:row[1],setting:nextSetting(row[1],settings)}];
   if(D>30&&row[2]!==null)result.alternatives.push({name:'Four wall strobes',count:4,required:row[2],setting:nextSetting(row[2],settings)});
   result.warnings.push('Wall lens location assumes the standard 80–96 in. mounting band. This planner does not handle low-ceiling exceptions.');
  }else if(v.mode==='ceiling'){
   const H=Number(v.height);if(!Number.isFinite(H)||H<=0||H>30)throw Error('Ceiling lens height must be greater than zero and no more than 30 ft. Above 30 ft needs another reviewed approach.');
   const band=H<=10?10:H<=20?20:30,table=CEILING_REFERENCE[band];result.heightBand=band;
   if(v.ceilingLayout==='grid'){
    const selected=Number(v.selected);if(!settings.includes(selected))throw Error('Grid candela must match one of your entered device settings.');
    const viable=table.filter(row=>row[1]<=selected);if(!viable.length)throw Error('Selected candela is below every ceiling reference at this height. Increase the setting or change mounting.');
    const cover=viable[viable.length-1][0],cols=Math.ceil(L/cover),rows=Math.ceil(W/cover);if(cols*rows>400)throw Error('This grid exceeds 400 devices. Split the area into smaller plans.');
    const dx=L/cols,dy=W/rows,dimension=Math.max(dx,dy),lookup=table.find(x=>x[0]>=dimension);
    result.count=cols*rows;result.required=lookup[1];result.setting=selected;result.lookupSize=lookup[0];result.sizingDimension=dimension;result.cols=cols;result.rows=rows;result.cellWidth=dx;result.cellHeight=dy;result.maxCell=cover;
    result.positions=Array.from({length:rows},(_,row)=>Array.from({length:cols},(_,col)=>({x:(col+.5)*dx,y:(row+.5)*dy}))).flat();
    result.method='Ceiling grid · centered in each modeled cell';
    result.warnings.push('The grid models each cell independently. Verify the actual coverage, obstructions, and synchronized multi-appliance arrangement.');
   }else{
    const offset=v.ceilingLayout==='offset',x=offset?Number(v.x):L/2,y=offset?Number(v.y):W/2;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>L||y<0||y>W)throw Error('The ceiling strobe position must be inside the room dimensions.');
    const D=2*Math.max(x,L-x,y,W-y),row=table.find(x=>x[0]>=D);if(!row)throw Error('The enclosing ceiling reference exceeds 70 ft. Choose a grid, reposition the device, or review another design.');
    result.count=1;result.required=row[1];result.setting=nextSetting(result.required,settings);result.positions=[{x,y}];result.lookupSize=row[0];result.sizingDimension=D;result.method=offset?'Ceiling strobe · offset position':'Ceiling strobe · room center';
   }
   result.warnings.push('Ceiling lookup uses limited manufacturer reference steps and may be conservative. Confirm intermediate sizes in your adopted code and equipment instructions.');
  }else throw Error('Select a supported mounting mode.');
  if(result.setting===null)result.warnings.unshift('None of your entered device settings meets the reference output. Change the appliance or arrangement.');
 }
 if(v.current!==''&&v.current!==undefined){const current=Number(v.current);if(!Number.isFinite(current)||current<0)throw Error('Current must be a non-negative value in mA.');result.load=current*result.count;}
 if(result.count>1)result.warnings.push('Coordinate synchronization as applicable; device count does not verify circuit capacity.');
 return result;
}
const notificationForm=document.querySelector('#notification');
if(notificationForm){
 const output=document.querySelector('#notification-result'),diagram=document.querySelector('#notification-diagram'),error=document.querySelector('#notification-error');
 const format=(x,d=1)=>x.toLocaleString(undefined,{maximumFractionDigits:d});
 const stat=(label,value)=>`<div class="result-stat">${label}: <strong>${value}</strong></div>`;
 function setControls(){const mode=notificationForm.elements.mode.value,layout=notificationForm.elements.ceilingLayout.value;
  for(const [selector,show] of [['.wall-control',mode==='wall'],['.ceiling-control',mode==='ceiling'],['.room-control',mode!=='corridor'],['.grid-control',mode==='ceiling'&&layout==='grid'],['.offset-control',mode==='ceiling'&&layout==='offset']])notificationForm.querySelectorAll(selector).forEach(label=>{label.hidden=!show;label.querySelectorAll('input,select').forEach(input=>input.disabled=!show);});
  document.querySelector('#mode-hint').textContent=mode==='corridor'?'Straight, unobstructed corridors up to 20 ft wide. Uses 15 cd wall strobes, end offsets ≤15 ft, and spacing ≤100 ft.':'Clear-lens, public-mode visible notification in an unobstructed rectangular, non-sleeping room.';
 }
 function roomDiagram(r){
  const maxWidth=440,maxHeight=250,scale=Math.min(maxWidth/r.length,maxHeight/r.width),w=r.length*scale,h=r.width*scale,ox=(500-w)/2,oy=40+(250-h)/2;
  let grid='';if(r.cols){for(let c=1;c<r.cols;c++)grid+=`<line x1="${ox+c*w/r.cols}" x2="${ox+c*w/r.cols}" y1="${oy}" y2="${oy+h}" class="room-grid"/>`;for(let rr=1;rr<r.rows;rr++)grid+=`<line x1="${ox}" x2="${ox+w}" y1="${oy+rr*h/r.rows}" y2="${oy+rr*h/r.rows}" class="room-grid"/>`;}
  const dots=r.positions.map((p,i)=>{const x=ox+p.x*scale,y=oy+h-p.y*scale;return `<g><circle cx="${x}" cy="${y}" r="7" class="room-device"/><title>Device ${i+1}: X ${format(p.x)} ft, Y ${format(p.y)} ft</title>${r.count<=12?`<text x="${x+11}" y="${y-10}" class="device-label">${i+1}</text>`:''}</g>`;}).join('');
  diagram.innerHTML=`<svg viewBox="0 0 500 340" role="img" aria-label="${r.count}-device ${r.mode} layout for a ${r.length} by ${r.width} foot area"><rect x="${ox}" y="${oy}" width="${w}" height="${h}" class="room-outline"/>${grid}${dots}<text x="250" y="325" text-anchor="middle" class="dimension-label">${format(r.length)} ft × ${format(r.width)} ft</text></svg><div class="diagram-legend"><span class="legend-device"></span>Proposed strobe position <span>Top view · X from left, Y from bottom</span></div>`;
 }
 function run(){setControls();try{error.textContent='';if(!notificationForm.checkValidity()){output.textContent='Enter valid values to see a room plan.';diagram.innerHTML='';return;}
  const values=Object.fromEntries([...notificationForm.querySelectorAll('input,select')].map(x=>[x.name,x.value]));const r=notificationPlan(values);
  output.innerHTML=`<div class="result-number">${r.setting===null?'No suitable setting':r.setting+' cd'}</div><p>${r.setting===null?'Adjust the device or layout':'Device setting for this plan'}</p>`+stat('Device count',r.count)+stat('Reference output per device',r.required+' cd')+stat('Arrangement',r.method)+(r.lookupSize?stat('Enclosing reference square',r.lookupSize+' × '+r.lookupSize+' ft'):'')+(r.heightBand?stat('Ceiling height reference',r.heightBand+' ft'):'')+(r.cols?stat('Grid',r.cols+' columns × '+r.rows+' rows')+stat('Cell size',format(r.cellWidth)+' × '+format(r.cellHeight)+' ft'):'')+(r.mode==='corridor'?stat('Maximum device interval',format(r.interval)+' ft')+stat('End offsets',format(r.endDistance)+' ft'):'')+(r.load!==undefined?stat('Entered current × device count',format(r.load,2)+' mA / '+format(r.load/1000,3)+' A'):'')+(r.alternatives&&r.alternatives.length>1?`<div class="arrangement-comparison"><h3>Compare wall arrangements</h3>${r.alternatives.map(a=>`<p><strong>${a.name}</strong><br>${a.required} cd reference per device · ${a.setting===null?'no entered setting available':a.setting+' cd selected per device'}</p>`).join('')}</div>`:'')+`<ul class="planner-notes">${r.warnings.map(x=>'<li>'+x+'</li>').join('')}</ul>`;
  roomDiagram(r);
 }catch(e){error.textContent=e.message;output.textContent='Adjust the inputs to create a supported plan.';diagram.innerHTML='';}}
 notificationForm.addEventListener('submit',e=>{e.preventDefault();run();});notificationForm.addEventListener('input',run);notificationForm.addEventListener('change',run);notificationForm.addEventListener('reset',()=>setTimeout(run,0));run();
}
