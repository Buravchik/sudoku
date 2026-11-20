export function challengeWidgetHtml(): string {
  return `<style>svg{width:100%;height:148px;display:block}.row{display:flex;justify-content:space-between;gap:8px;margin-top:4px}b{font-weight:700}.meta{color:var(--tg-theme-hint-color,#808080)}</style><svg id="c" viewBox="0 0 320 140"></svg><div id="l"></div><script>
const W=window.TelegramWidget,C=['#c4b5fd','#fbbf24','#5eead4','#fb7185','#93c5fd','#86efac','#fdba74','#e879f9'];
function node(tag,attrs){const item=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.keys(attrs).forEach(function(key){item.setAttribute(key,attrs[key])});return item}
function render(){if(!W)return;let data=null;try{data=JSON.parse(W.chatData||W.publicData||'null')}catch(e){}
const svg=document.getElementById('c'),list=document.getElementById('l');while(svg.firstChild)svg.removeChild(svg.firstChild);list.textContent='';
for(let y=10;y<=130;y+=30)svg.appendChild(node('line',{x1:'8',x2:'312',y1:String(y),y2:String(y),stroke:'var(--tg-theme-section-separator-color,#999)','stroke-width':'1'}));
((data&&data.p)||[]).forEach(function(person,index){const values=person.g||[],color=C[index%C.length];
if(values.length){const points=values.map(function(value,step){const x=values.length<2?160:8+(step/(values.length-1))*304;const y=130-(Math.max(0,Math.min(100,+value))/100)*120;return x.toFixed(1)+','+y.toFixed(1)}).join(' ');
svg.appendChild(node('polyline',{points:points,fill:'none',stroke:color,'stroke-width':'2.5','stroke-linecap':'round','stroke-linejoin':'round'}))}
const row=document.createElement('div');row.className='row';const name=document.createElement('b');name.style.color=color;name.textContent=person.n||'';
const meta=document.createElement('span');meta.className='meta';meta.textContent=(person.m||'')+(typeof person.s==='number'?' \\u00b7 '+person.s:'');
row.appendChild(name);row.appendChild(meta);list.appendChild(row)})}
if(W){W.onEvent('chatDataChanged',render);W.onEvent('publicDataChanged',render);render();if(typeof W.ready==='function')W.ready()}
</script>`;
}
