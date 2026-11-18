'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function render(){
 const map=JSON.parse(fs.readFileSync(path.join(root,'scripts/ch01-last-broadcast-layout.json'),'utf8'));
 const court=JSON.parse(fs.readFileSync(path.join(root,'scripts/ch01-original-public-court.json'),'utf8'));
 const x=v=>80+(v-5300)*.145,y=v=>130+(v+7400)*.145;
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1040" viewBox="0 0 1200 1040">';
 svg+='<rect width="1200" height="1040" fill="#101e26"/><g font-family="Arial,sans-serif" fill="#e5ede9">';
 svg+='<text x="42" y="48" font-size="27" font-weight="bold">VEILPOINT | LAST BROADCAST</text><text x="42" y="80" font-size="16" fill="#aac0c5">Native playable blockout / original X-Y layout / not surveyed Aden</text>';
 svg+='<rect x="42" y="108" width="1108" height="840" rx="12" fill="#1a2a31"/><defs><clipPath id="plot"><rect x="42" y="108" width="1108" height="840" rx="12"/></clipPath></defs><g clip-path="url(#plot)">';
 for(let gx=5500;gx<=12000;gx+=500)svg+=`<path d="M ${x(gx)} 120 V 930" stroke="#293d43"/><text x="${x(gx)+4}" y="932" font-size="10" fill="#789096">X ${gx/100}m</text>`;
 for(let gy=-7000;gy<=-2000;gy+=500)svg+=`<path d="M 60 ${y(gy)} H 1130" stroke="#293d43"/><text x="63" y="${y(gy)-4}" font-size="10" fill="#789096">Y ${gy/100}m</text>`;
 const pieces=[...map.pieces,...court.pieces.map(p=>({name:p.id,centreCm:[p.xCm,p.yCm,p.zCm],sizeCm:[p.widthCm,p.depthCm,p.heightCm],solid:p.solid}))];
 for(const p of pieces){
  const [cx,cy,cz]=p.centreCm,[w,d,h]=p.sizeCm;
  const roof=cz-h/2>200;
  svg+=`<rect x="${x(cx-w/2)}" y="${y(cy-d/2)}" width="${w*.145}" height="${d*.145}" transform="rotate(${p.yawDegrees||0} ${x(cx)} ${y(cy)})" fill="${roof?'none':p.solid?'#8b826e':'#314248'}" stroke="${p.finish==='ShelterTeal'?'#6db299':roof?'#8b9a87':'#727768'}" ${roof?'stroke-dasharray="6 5"':''}><title>${esc(p.name)}</title></rect>`;
 }
 // Existing imported hall envelope, with the actual four-metre openings.
 for(const [ax,bx]of [[10200,10800],[11200,11800]])for(const gy of [-8500,-6500])if(gy>=-7400)
  svg+=`<path d="M ${x(ax)} ${y(gy)} H ${x(bx)}" stroke="#a99c82" stroke-width="7"/>`;
 svg+=`<path d="M ${x(10200)} 120 V ${y(-6500)} M ${x(11800)} 120 V ${y(-6500)}" stroke="#a99c82" stroke-width="7"/>`;
 svg+=`<text x="${x(10400)}" y="${y(-7200)}" font-size="14" fill="#b8c9b6">ORIGINAL BLENDER HALL</text>`;
 const poly=(points,color)=>`<polyline points="${points.map(p=>`${x(p[0])},${y(p[1])}`).join(' ')}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round"/>`;
 svg+=poly([[6100,-3800],...map.convoy.Workshop],'#c3d1c8');
 svg+=poly([...map.convoy.Workshop,...map.convoy.South,...map.convoy.BoardSouth],'#efba64');
 svg+=poly([...map.convoy.Workshop,...map.convoy.East,...map.convoy.BoardEast],'#68bad2');
 svg+=poly([...map.convoy.BoardSouth.slice(-1),...map.convoy.Reception],'#c3d1c8');
 svg+=poly([[11000,-5460],[11000,-6400],[11000,-6850],[11400,-6850]],'#bbcfb1');
 const labels=['1 AID HANDOVER','2 STREET WARNING','3 WORKSHOP','4S SOUTH CHOICE','4E EAST CHOICE','5S CLEAR SOUTH','5E CLEAR EAST','6 NADIM / GROUP','7 SALMA / SHELTER','8 WITHDRAWAL RADIO','9 MARIAM / BROADCAST'];
 const offsets=[[-70,34],[-120,-35],[-50,28],[-190,-10],[-72,30],[-75,-24],[-70,30],[8,28],[12,-24],[-220,-10],[-230,28]];
 for(let i=0;i<map.stationsCm.length;i++){
  const p=map.stationsCm[i],[dx,dy]=offsets[i];
  svg+=`<circle cx="${x(p[0])}" cy="${y(p[1])}" r="7" fill="#e6e8d0"/><text x="${x(p[0])+dx}" y="${y(p[1])+dy}" font-size="13" font-weight="bold">${labels[i]}</text>`;
 }
 svg+='</g>';
 svg+='<text x="42" y="982" font-size="16" fill="#efba64">South escort</text><text x="216" y="982" font-size="16" fill="#68bad2">East escort</text><text x="385" y="982" font-size="16" fill="#bbcfb1">Shared shelter / radio approach</text>';
 svg+='<text x="42" y="1015" font-size="14" fill="#a7babe">F: interact | J: field notes | R: reload | L: lamp | MMB: local mark | ESC: menu</text>';
 return svg+'</g></svg>\n';
}
const target=path.join(root,'docs/media/ch01-native-plan.svg');
if(require.main===module){const svg=render();if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==svg)throw Error('Native map plan is stale');}else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,svg);}}
module.exports={render};
