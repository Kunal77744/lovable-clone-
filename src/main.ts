import * as THREE from "three";
import "./style.css";
import { captureFirstValue, captureGameOpened, captureRunResultShared, captureRunStarted } from "./analytics";
import { createDailyRandom, formatDailyDate, getUtcDateKey, readDailyBest, saveDailyBest } from "./daily-challenge";
import { readPersonalBest, savePersonalBest } from "./personal-best";
import { readChallengeDistance, readDailyChallenge, shareRunResult } from "./share-result";

type State = "ready"|"countdown"|"running"|"paused"|"gameover";
type RunMode = "free"|"daily";
type HazardKind = "crate"|"arch"|"spikes";
interface Hazard{mesh:THREE.Group;kind:HazardKind;lane:number;z:number;checked:boolean;passed:boolean}
interface Relic{mesh:THREE.Group;lane:number;z:number;taken:boolean}
interface Spark{mesh:THREE.Mesh;velocity:THREE.Vector3;life:number}

const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const canvas=$("#game") as HTMLCanvasElement;
const gameFrame=$(".game-frame");
const startPanel=$("#start-panel"),gameOverPanel=$("#game-over-panel"),countdown=$("#countdown");
const distanceEl=$("#distance"),relicEl=$("#relics"),multiplierEl=$("#multiplier"),toast=$("#toast");
const chainEl=$("#chain"),mission=$("#mission"),progress=$("#progress"),speedLines=$("#speed-lines");
const bestDistanceEl=$("#best-distance"),bestRelicsEl=$("#best-relics"),recordStatusEl=$("#record-status");
const shareButton=$("#share-button") as HTMLButtonElement,shareStatus=$("#share-status");
const controlsCopy=$("#controls-copy");
const challengeStart=$("#challenge-start"),challengeLabel=$("#challenge-label"),challengeTargetEl=$("#challenge-target");
const challengeResult=$("#challenge-result"),challengeResultCopy=$("#challenge-result-copy");
const dailyButton=$("#daily-button") as HTMLButtonElement,dailyDateEl=$("#daily-date"),dailyStartBestEl=$("#daily-start-best");
const dailyResult=$("#daily-result"),dailyResultDate=$("#daily-result-date"),dailyResultCopy=$("#daily-result-copy"),missionLabel=$("#mission-label");
const startButtonCopy=$("#start-button-copy");
const pausePanel=$("#pause-panel"),pauseCopy=$("#pause-copy"),pauseDistance=$("#pause-distance"),pauseHint=$("#pause-hint");
const pauseButton=$("#pause-button") as HTMLButtonElement,resumeButton=$("#resume-button") as HTMLButtonElement;
const controlGuides=[...document.querySelectorAll<HTMLElement>("[data-control-guide]")];
const coarsePointer=matchMedia("(pointer: coarse)");
const challengeTarget=readChallengeDistance(location.search);
const dailyChallenge=readDailyChallenge(location.search);

if(challengeTarget!==null){
  challengeStart.hidden=false;
  challengeTargetEl.textContent=String(challengeTarget);
  if(dailyChallenge){
    challengeLabel.textContent=`Daily ${formatDailyDate(dailyChallenge.date)} · UTC`;
    startButtonCopy.textContent="Run this daily route";
    dailyButton.hidden=true;
  }
}

function setControlGuide(input:"keyboard"|"touch"){
  controlsCopy.dataset.input=input;
  pauseHint.textContent=input==="touch"?"Tap Resume to continue":"Press P or Esc to continue";
  controlGuides.forEach(guide=>guide.hidden=guide.dataset.controlGuide!==input);
}
function setCapabilityGuide(){setControlGuide(coarsePointer.matches||navigator.maxTouchPoints>0?"touch":"keyboard")}
setCapabilityGuide();
coarsePointer.addEventListener("change",setCapabilityGuide);
addEventListener("pointerdown",event=>{
  if(event.pointerType==="touch"||event.pointerType==="pen")setControlGuide("touch");
  else if(event.pointerType==="mouse"&&!coarsePointer.matches)setControlGuide("keyboard");
},{passive:true});

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x07100d);
scene.fog=new THREE.FogExp2(0x0b1913,.018);
const camera=new THREE.PerspectiveCamera(51,1,.1,240);
camera.position.set(0,4.7,9.5);
let renderer:THREE.WebGLRenderer|null=null;
let fallback:CanvasRenderingContext2D|null=null;
let webglAvailable=false;
try{webglAvailable=!!document.createElement("canvas").getContext("webgl2")}catch{webglAvailable=false}
if(webglAvailable){
  try{
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.15;
  }catch{renderer=null}
}
if(!renderer)fallback=canvas.getContext("2d");
gameFrame.dataset.renderingMode=renderer?"webgl":"canvas";

const hemi=new THREE.HemisphereLight(0x9ec6ac,0x172019,1.75);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffd486,3.2);sun.position.set(-8,16,12);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-8;scene.add(sun);
const rim=new THREE.DirectionalLight(0x6ea68b,1.7);rim.position.set(10,5,-18);scene.add(rim);

const mat={
  stone:new THREE.MeshStandardMaterial({color:0x31463c,roughness:.9}),
  stone2:new THREE.MeshStandardMaterial({color:0x52665a,roughness:.86}),
  dark:new THREE.MeshStandardMaterial({color:0x111b17,roughness:.75}),
  red:new THREE.MeshStandardMaterial({color:0x9d342c,roughness:.6}),
  red2:new THREE.MeshStandardMaterial({color:0xd75a3f,roughness:.55}),
  gold:new THREE.MeshStandardMaterial({color:0xe9a936,metalness:.65,roughness:.25,emissive:0x5a3205,emissiveIntensity:.65}),
  skin:new THREE.MeshStandardMaterial({color:0xa86f49,roughness:.75}),
  hair:new THREE.MeshStandardMaterial({color:0x17130f,roughness:.9}),
  teal:new THREE.MeshStandardMaterial({color:0x1d594d,roughness:.65}),
  relic:new THREE.MeshStandardMaterial({color:0xffc94f,metalness:.8,roughness:.16,emissive:0xe38b16,emissiveIntensity:2.1}),
};
const box=(x:number,y:number,z:number,m:THREE.Material)=>new THREE.Mesh(new THREE.BoxGeometry(x,y,z),m);
const cyl=(r:number,h:number,m:THREE.Material,seg=10)=>new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),m);
const cast=(o:THREE.Object3D)=>o.traverse(c=>{if(c instanceof THREE.Mesh){c.castShadow=true;c.receiveShadow=true}});

const world=new THREE.Group();scene.add(world);
const roadTiles:THREE.Mesh[]=[];const sideProps:THREE.Group[]=[];
for(let i=0;i<22;i++){
  const tile=box(9,.22,5.75,i%2?mat.stone:mat.stone2);tile.position.set(0,-.16,5-i*5.7);tile.receiveShadow=true;
  const groove=new THREE.Group();for(const x of[-3,-1.5,0,1.5,3]){const g=box(.035,.03,5.6,mat.dark);g.position.set(x,.14,0);groove.add(g)}tile.add(groove);world.add(tile);roadTiles.push(tile);
  const prop=makeSideProp(i);prop.position.z=4-i*7.3;world.add(prop);sideProps.push(prop);
}
const abyss=box(90,1,170,new THREE.MeshStandardMaterial({color:0x06100c}));abyss.position.set(0,-1,-65);world.add(abyss);
const moon=new THREE.Mesh(new THREE.SphereGeometry(6,24,16),new THREE.MeshBasicMaterial({color:0xe3a943}));moon.position.set(-34,24,-105);scene.add(moon);
const mountainMat=new THREE.MeshStandardMaterial({color:0x10241c,roughness:1});
for(let i=0;i<12;i++){const m=new THREE.Mesh(new THREE.ConeGeometry(9+Math.random()*12,25+Math.random()*25,5),mountainMat);m.position.set((i-6)*18+(i%2)*5,7,-100-Math.random()*55);m.rotation.y=Math.random();scene.add(m)}

function makeSideProp(i:number){
  const g=new THREE.Group();const side=i%2?1:-1;g.position.x=side*(7+Math.random()*7);
  if(i%3===0){const base=box(2.2,.7,2.2,mat.stone);base.position.y=.35;g.add(base);const p=cyl(.65,5+Math.random()*4,mat.stone2,8);p.position.y=3.2;g.add(p);const cap=box(1.8,.45,1.8,mat.stone);cap.position.y=6;g.add(cap)}
  else if(i%3===1){const trunk=cyl(.32,3.8,mat.dark,7);trunk.position.y=1.9;g.add(trunk);for(let j=0;j<3;j++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(2.3-j*.4,3.8,7),new THREE.MeshStandardMaterial({color:j%2?0x173d2d:0x20503b,roughness:1}));leaf.position.y=3.8+j*1.4;g.add(leaf)}}
  else{for(let j=0;j<3;j++){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.9+Math.random()*.9,0),j%2?mat.stone:mat.stone2);rock.position.set(j*.7-1,.6,Math.random());rock.scale.y=.8+Math.random();g.add(rock)}}
  cast(g);return g;
}

function makeRunner(){
  const g=new THREE.Group();g.name="Kael";
  const hips=new THREE.Group();hips.name="hips";g.add(hips);
  const torso=box(1.05,1.5,.62,mat.red);torso.position.y=2.15;torso.rotation.x=-.08;hips.add(torso);
  const chest=box(1.18,.28,.74,mat.gold);chest.position.y=2.45;hips.add(chest);
  const belt=box(1.14,.16,.68,mat.gold);belt.position.y=1.53;hips.add(belt);
  const medallion=new THREE.Mesh(new THREE.OctahedronGeometry(.2),mat.relic);medallion.position.set(0,2.35,.48);medallion.rotation.z=Math.PI/4;hips.add(medallion);
  const head=new THREE.Group();head.name="head";head.position.y=3.35;hips.add(head);
  const face=new THREE.Mesh(new THREE.SphereGeometry(.42,12,10),mat.skin);face.scale.z=.88;head.add(face);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.44,10,8,0,Math.PI*2,0,Math.PI*.57),mat.hair);hair.position.y=.14;head.add(hair);
  const crest=box(.16,.45,.22,mat.gold);crest.position.set(0,.5,0);crest.rotation.z=-.12;head.add(crest);
  for(const side of[-1,1]){
    const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.29,9,6),mat.gold);shoulder.scale.set(1.3,.7,1);shoulder.position.set(side*.67,2.65,0);hips.add(shoulder);
    const arm=new THREE.Group();arm.name=side<0?"armL":"armR";arm.position.set(side*.62,2.47,0);hips.add(arm);
    const upper=cyl(.15,.85,mat.red2,8);upper.position.y=-.38;upper.rotation.z=side*.08;arm.add(upper);
    const glove=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),mat.dark);glove.position.y=-.85;arm.add(glove);
    const leg=new THREE.Group();leg.name=side<0?"legL":"legR";leg.position.set(side*.28,1.48,0);hips.add(leg);
    const thigh=cyl(.2,1.05,mat.dark,8);thigh.position.y=-.48;leg.add(thigh);
    const boot=box(.42,.72,.64,mat.hair);boot.position.set(0,-1.1,.13);leg.add(boot);
  }
  const cape=new THREE.Group();cape.name="cape";hips.add(cape);
  for(let i=0;i<4;i++){const strip=box(.24,1.75,.08,i%2?mat.red:mat.red2);strip.position.set((i-1.5)*.25,1.75,-.44);strip.rotation.x=.18;strip.name=`cape${i}`;cape.add(strip)}
  cast(g);g.scale.setScalar(.92);g.position.set(0,0,3.2);scene.add(g);return g;
}
const runner=makeRunner();const hips=runner.getObjectByName("hips")!;const armL=runner.getObjectByName("armL")!,armR=runner.getObjectByName("armR")!,legL=runner.getObjectByName("legL")!,legR=runner.getObjectByName("legR")!,cape=runner.getObjectByName("cape")!;

function makeRelic(){
  const g=new THREE.Group();const core=new THREE.Mesh(new THREE.OctahedronGeometry(.34),mat.relic);core.rotation.z=Math.PI/4;g.add(core);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.52,.045,6,18),mat.gold);ring.rotation.x=Math.PI/2;g.add(ring);
  const light=new THREE.PointLight(0xffb52f,2.4,5);g.add(light);cast(g);return g;
}
function makeHazard(kind:HazardKind){
  const g=new THREE.Group();
  if(kind==="crate"){const b=box(1.8,1.35,1.1,mat.stone2);b.position.y=.68;g.add(b);const band=box(1.94,.18,1.18,mat.gold);band.position.y=.75;g.add(band)}
  if(kind==="spikes"){for(let i=-2;i<=2;i++){const s=new THREE.Mesh(new THREE.ConeGeometry(.28,1.15,6),mat.gold);s.position.set(i*.38,.56,0);g.add(s)}}
  if(kind==="arch"){for(const x of[-1.05,1.05]){const p=box(.42,3.3,.55,mat.stone2);p.position.set(x,1.65,0);g.add(p)}const top=box(2.55,.7,.62,mat.stone2);top.position.y=3.05;g.add(top);const teeth=box(1.65,.55,.74,mat.gold);teeth.position.y=2.42;g.add(teeth)}
  cast(g);return g;
}

let state:State="ready",activeMode:RunMode="free",activeRunNumber=0,lane=0,targetX=0,jumpY=0,jumpV=0,slide=0,distance=0,relics=0,combo=1,bestCombo=1,chain=0,speed=15,spawnClock=0,pattern=0,last=performance.now(),visualTime=0,toastClock=0,shake=0,flash=0,audioOn=true,audio:AudioContext|null=null;
let countdownTimer:number|undefined;
let personalBest=readPersonalBest();
let dailyKey=dailyChallenge?.date??getUtcDateKey(),dailyBest=readDailyBest(dailyKey),dailyRandom=createDailyRandom(dailyKey);
const hazards:Hazard[]=[],relicList:Relic[]=[],sparks:Spark[]=[];
const lanes=[-2.25,0,2.25];

function refreshDailyIntro(){
  const currentKey=getUtcDateKey();
  if(currentKey!==dailyKey){dailyKey=currentKey;dailyRandom=createDailyRandom(dailyKey)}
  dailyBest=readDailyBest(dailyKey);
  dailyDateEl.textContent=`${formatDailyDate(dailyKey)} · UTC`;
  dailyStartBestEl.textContent=String(dailyBest.distance);
}
function reset(){
  hazards.forEach(h=>scene.remove(h.mesh));relicList.forEach(r=>scene.remove(r.mesh));sparks.forEach(s=>scene.remove(s.mesh));hazards.length=relicList.length=sparks.length=0;
  if(activeMode==="daily"){dailyKey=dailyChallenge?.date??getUtcDateKey();dailyBest=readDailyBest(dailyKey);dailyRandom=createDailyRandom(dailyKey)}
  lane=0;targetX=0;jumpY=0;jumpV=0;slide=0;distance=0;relics=0;combo=1;bestCombo=1;chain=0;speed=15;spawnClock=.8;pattern=0;runner.visible=true;updateHud();
}
function clearCountdown(){
  if(countdownTimer!==undefined)clearTimeout(countdownTimer);
  countdownTimer=undefined;
  countdown.hidden=true;
}
function setState(next:State){
  state=next;
  gameFrame.dataset.state=next;
  const active=next==="countdown"||next==="running"||next==="paused";
  pauseButton.hidden=!active;
  pauseButton.setAttribute("aria-label",next==="paused"?"Resume run":"Pause run");
  pauseButton.querySelector("span")!.textContent=next==="paused"?"▶":"Ⅱ";
}
function beginCountdown(){
  clearCountdown();setState("countdown");pausePanel.hidden=true;countdown.hidden=false;let n=3;countdown.textContent=String(n);ping(300);
  const tick=()=>{
    if(state!=="countdown")return;
    n--;
    if(n>0){countdown.textContent=String(n);ping(340+n*70);countdownTimer=window.setTimeout(tick,520);return}
    countdown.textContent="GO";ping(650);
    countdownTimer=window.setTimeout(()=>{if(state!=="countdown")return;countdown.hidden=true;countdownTimer=undefined;last=performance.now();setState("running")},380);
  };
  countdownTimer=window.setTimeout(tick,520);
}
function pauseRun(automatic=false){
  if(state!=="running"&&state!=="countdown")return;
  clearCountdown();setState("paused");pauseDistance.textContent=String(Math.floor(distance));
  pauseCopy.textContent=automatic?"Paused while you were away. Your route and score are safe.":"Your route and score are safe.";
  pausePanel.hidden=false;
  if(audio?.state==="running")void audio.suspend();
  resumeButton.focus({preventScroll:true});
}
function resumeRun(){
  if(state!=="paused")return;
  ensureAudio();last=performance.now();beginCountdown();
}
function start(mode:RunMode){
  if(state!=="ready"&&state!=="gameover")return;
  activeMode=mode;ensureAudio();reset();startPanel.hidden=true;gameOverPanel.hidden=true;challengeResult.hidden=true;dailyResult.hidden=true;shareStatus.textContent="";shareButton.disabled=false;missionLabel.textContent=activeMode==="daily"?`Daily ${formatDailyDate(dailyKey)}`:"Relic chain";mission.hidden=false;activeRunNumber=captureRunStarted(renderer?"webgl":"canvas",activeMode,challengeTarget!==null);beginCountdown();
}
function gameOver(){
  const runDistance=Math.floor(distance),previousBest=personalBest;
  personalBest=savePersonalBest({distance:runDistance,relics});
  const distanceRecord=runDistance>previousBest.distance,relicRecord=relics>previousBest.relics;
  clearCountdown();setState("gameover");shake=.8;mission.hidden=true;$("#final-distance").textContent=String(runDistance);$("#final-relics").textContent=String(relics);$("#final-chain").textContent=`×${bestCombo}`;
  bestDistanceEl.textContent=String(personalBest.distance);bestRelicsEl.textContent=String(personalBest.relics);
  recordStatusEl.textContent=distanceRecord&&relicRecord?"Two new records":distanceRecord?"New distance record":relicRecord?"New sunshard record":"Expedition ended";
  $("#run-summary").textContent=distance>700?"You reached the sunken gate.":distance>300?"The vault has started to notice you.":"The causeway demands another run.";
  if(challengeTarget!==null){
    const margin=runDistance-challengeTarget;
    challengeResult.classList.toggle("is-won",margin>0);
    challengeResult.classList.toggle("is-missed",margin<=0);
    challengeResultCopy.textContent=margin>0?`Target beaten by ${margin}m`:margin===0?"Target tied. One more metre wins.":`Target missed by ${Math.abs(margin)}m`;
    challengeResult.hidden=false;
  }
  if(activeMode==="daily"){
    const previousDaily=dailyBest;
    dailyBest=saveDailyBest(dailyKey,{distance:runDistance,relics});
    const dailyRecord=runDistance>previousDaily.distance;
    dailyResultDate.textContent=`Daily ${formatDailyDate(dailyKey)} · UTC`;
    dailyResultCopy.textContent=dailyRecord?`New daily best · ${dailyBest.distance}m`:`Today's best · ${dailyBest.distance}m`;
    dailyResult.classList.toggle("is-record",dailyRecord);dailyResult.hidden=false;refreshDailyIntro();
  }
  setTimeout(()=>gameOverPanel.hidden=false,300);thud();
}
function updateHud(){distanceEl.textContent=String(Math.floor(distance));relicEl.textContent=String(relics);multiplierEl.textContent=`×${combo}`;chainEl.textContent=`${chain%5} / 5`;progress.style.width=`${(distance%500)/5}%`}
function pop(msg:string){toast.textContent=msg;toast.classList.add("visible");toastClock=.8}
function ensureAudio(){if(!audioOn)return;if(!audio)audio=new AudioContext();if(audio.state==="suspended")void audio.resume()}
function sound(f:number,d:number,type:OscillatorType,v=.06){if(!audioOn)return;ensureAudio();if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(f,audio.currentTime);g.gain.setValueAtTime(v,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+d)}
const ping=(f:number)=>sound(f,.12,"triangle",.07),thud=()=>sound(72,.32,"sawtooth",.12);

function spawnPattern(){
  const random=activeMode==="daily"?dailyRandom:Math.random;
  pattern++;const base=-82;const chosen=pattern<2?0:Math.floor(random()*3)-1;
  if(pattern===1){for(let i=0;i<5;i++)spawnRelic(0,base-i*3.1);spawnHazard("crate",0,base-20)}
  else{const kind=(["crate","arch","spikes"] as HazardKind[])[Math.floor(random()*3)];spawnHazard(kind,chosen,base);const safe=[-1,0,1].filter(l=>l!==chosen);const rlane=safe[Math.floor(random()*safe.length)];for(let i=0;i<(random()>.45?3:1);i++)spawnRelic(rlane,base-3-i*2.6)}
}
function spawnHazard(kind:HazardKind,l:number,z:number){const mesh=makeHazard(kind);mesh.position.set(lanes[l+1],0,z);scene.add(mesh);hazards.push({mesh,kind,lane:l,z,checked:false,passed:false})}
function spawnRelic(l:number,z:number){const mesh=makeRelic();mesh.position.set(lanes[l+1],1.65,z);scene.add(mesh);relicList.push({mesh,lane:l,z,taken:false})}
function burst(pos:THREE.Vector3,color=0xffc94f,n=18){for(let i=0;i<n;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.045+Math.random()*.06,5,4),new THREE.MeshBasicMaterial({color}));m.position.copy(pos);scene.add(m);sparks.push({mesh:m,velocity:new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*4),life:.55+Math.random()*.35})}}
function move(dir:number){if(state!=="running")return;lane=Math.max(-1,Math.min(1,lane+dir));targetX=lanes[lane+1];runner.rotation.z=-dir*.12;ping(170+lane*18)}
function jump(){if(state!=="running"||jumpY>.03||slide>0)return;jumpV=8.7;ping(280)}
function duck(){if(state!=="running"||jumpY>.08)return;slide=.72;ping(150)}

function update(dt:number){
  const d=Math.min(dt,.033);
  if(state==="paused")return;
  visualTime+=d;
  const running=state==="running";const worldSpeed=running?speed:2.2;
  roadTiles.forEach(t=>{t.position.z+=worldSpeed*d;if(t.position.z>8)t.position.z-=22*5.7});
  sideProps.forEach(p=>{p.position.z+=worldSpeed*d*.92;if(p.position.z>15)p.position.z-=22*7.3});
  const runT=visualTime*(running?8.5:1.1);
  runner.position.x+=(targetX-runner.position.x)*Math.min(1,d*14);runner.position.y=jumpY;
  const runnerScale=state==="ready"&&innerWidth<760?.64:.92;runner.scale.setScalar(runner.scale.x+(runnerScale-runner.scale.x)*Math.min(1,d*8));
  runner.rotation.z*=Math.pow(.03,d);hips.position.y=(running?Math.abs(Math.sin(runT))*0.13:Math.sin(runT)*.03)+(slide>0?-.75:0);
  hips.rotation.x=slide>0?1.0:-.07+jumpV*.016;legL.rotation.x=Math.sin(runT)*.78*(slide>0?.2:1);legR.rotation.x=-Math.sin(runT)*.78*(slide>0?.2:1);armL.rotation.x=-Math.sin(runT)*.65;armR.rotation.x=Math.sin(runT)*.65;
  cape.children.forEach((c,i)=>{c.rotation.x=.22+Math.sin(runT*1.2+i*.8)*.16+(running?speed*.012:0)});
  if(running){
    distance+=d*speed*1.55;speed=Math.min(27,15+distance/130);spawnClock-=d;if(spawnClock<=0){spawnPattern();spawnClock=Math.max(1.75,3.0-distance/1300)}
    if(jumpY>0||jumpV>0){jumpY+=jumpV*d;jumpV-=20*d;if(jumpY<=0){jumpY=0;jumpV=0;burst(new THREE.Vector3(runner.position.x,.08,3),0x8fa58f,7)}}
    slide=Math.max(0,slide-d);
    hazards.forEach(h=>{h.z+=speed*d;h.mesh.position.z=h.z;const close=h.z>2.1&&h.z<4.1&&Math.abs(h.lane-lane)<.35;if(close&&!h.checked){const avoided=(h.kind!=="arch"&&jumpY>1.05)||(h.kind==="arch"&&slide>.08);h.checked=true;if(avoided){combo=Math.min(5,combo+1);bestCombo=Math.max(bestCombo,combo);pop("Clean escape");ping(510)}else gameOver()}if(state==="running"&&!h.passed&&h.z>=4.25){h.passed=true;captureFirstValue(renderer?"webgl":"canvas",h.kind,distance)}});
    relicList.forEach(r=>{r.z+=speed*d;r.mesh.position.z=r.z;r.mesh.rotation.y+=d*3.5;r.mesh.position.y=1.65+Math.sin(runT+r.z)*.13;if(!r.taken&&r.z>2&&r.z<4.25&&Math.abs(r.lane-lane)<.4&&jumpY<2.3){r.taken=true;relics++;chain++;if(chain%5===0){combo=Math.min(5,combo+1);bestCombo=Math.max(bestCombo,combo);pop(`Relic chain ×${combo}`)}else pop("+ Sunshard");multiplierEl.classList.add("pop");setTimeout(()=>multiplierEl.classList.remove("pop"),180);burst(r.mesh.position.clone(),0xffc94f,22);ping(650+(relics%5)*55);scene.remove(r.mesh)}});
    for(let i=hazards.length-1;i>=0;i--)if(hazards[i].z>13){scene.remove(hazards[i].mesh);hazards.splice(i,1)}
    for(let i=relicList.length-1;i>=0;i--)if(relicList[i].z>13||relicList[i].taken)relicList.splice(i,1);
    updateHud();
  }
  sparks.forEach(s=>{s.life-=d;s.velocity.y-=7*d;s.mesh.position.addScaledVector(s.velocity,d);s.mesh.scale.setScalar(Math.max(.01,s.life*1.6))});for(let i=sparks.length-1;i>=0;i--)if(sparks[i].life<=0){scene.remove(sparks[i].mesh);sparks.splice(i,1)}
  if(toastClock>0){toastClock-=d;if(toastClock<=0)toast.classList.remove("visible")}
  shake=Math.max(0,shake-d*3);flash=Math.max(0,flash-d*3);
  camera.position.x+=(runner.position.x*.22-camera.position.x)*d*3;camera.position.y=4.7+jumpY*.08+Math.sin(runT*2)*.025*(running?1:0);camera.position.z=9.5+(running?Math.sin(runT)*.035:0);
  if(shake>0){camera.position.x+=(Math.random()-.5)*shake*.28;camera.position.y+=(Math.random()-.5)*shake*.18}
  camera.lookAt(runner.position.x*.13,1.35,-8);speedLines.style.opacity=running?String(Math.max(0,(speed-19)/13)):"0";
}
function drawFallback(){
  if(!fallback)return;
  const c=fallback,w=canvas.clientWidth,h=canvas.clientHeight,run=state==="running"||state==="countdown";
  c.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);c.clearRect(0,0,w,h);
  const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,"#07110e");sky.addColorStop(.45,"#19382b");sky.addColorStop(1,"#08120e");c.fillStyle=sky;c.fillRect(0,0,w,h);
  const glow=c.createRadialGradient(w*.68,h*.22,0,w*.68,h*.22,w*.3);glow.addColorStop(0,"rgba(255,190,71,.4)");glow.addColorStop(.18,"rgba(232,164,57,.12)");glow.addColorStop(1,"transparent");c.fillStyle=glow;c.fillRect(0,0,w,h);
  c.fillStyle="#d89e38";c.beginPath();c.arc(w*.68,h*.2,Math.max(24,w*.025),0,Math.PI*2);c.fill();
  c.fillStyle="#0d241b";c.beginPath();c.moveTo(0,h*.35);for(let i=0;i<=9;i++){const x=i*w/8;c.lineTo(x,h*(.31+Math.sin(i*2.2)*.05))}c.lineTo(w,h*.62);c.lineTo(0,h*.62);c.fill();
  c.fillStyle="rgba(124,169,136,.07)";for(let i=0;i<5;i++){c.beginPath();c.ellipse(w*(.12+i*.22),h*(.35+(i%2)*.09),w*.2,h*.035,0,0,Math.PI*2);c.fill()}
  const hy=h*.29,gy=h*.95;c.fillStyle="#2d4438";c.beginPath();c.moveTo(w*.47,hy);c.lineTo(w*.53,hy);c.lineTo(w*.91,gy);c.lineTo(w*.09,gy);c.closePath();c.fill();
  c.strokeStyle="rgba(204,215,188,.24)";c.lineWidth=3;c.beginPath();c.moveTo(w*.47,hy);c.lineTo(w*.09,gy);c.moveTo(w*.53,hy);c.lineTo(w*.91,gy);c.stroke();
  c.fillStyle="#13271e";c.beginPath();c.moveTo(0,h*.57);c.lineTo(w*.11,h*.5);c.lineTo(w*.17,h*.62);c.lineTo(w*.25,h*.56);c.lineTo(w*.28,h);c.lineTo(0,h);c.fill();c.beginPath();c.moveTo(w,h*.5);c.lineTo(w*.88,h*.43);c.lineTo(w*.8,h*.62);c.lineTo(w*.75,h*.56);c.lineTo(w*.72,h);c.lineTo(w,h);c.fill();
  const travel=(visualTime*(run?speed*.025:.04))%1;
  for(let i=0;i<16;i++){const p=(i/15+travel)%1,y=hy+Math.pow(p,1.72)*(gy-hy),half=w*(.03+p*.4);c.fillStyle=i%2?"rgba(88,111,95,.2)":"rgba(25,49,39,.14)";c.beginPath();c.moveTo(w/2-half,y);const ny=hy+Math.pow(Math.min(1,p+.055),1.72)*(gy-hy),nh=w*(.03+Math.min(1,p+.055)*.4);c.lineTo(w/2+half,y);c.lineTo(w/2+nh,ny);c.lineTo(w/2-nh,ny);c.fill();c.strokeStyle=`rgba(226,220,187,${.05+p*.22})`;c.lineWidth=1+p*2;c.beginPath();c.moveTo(w/2-half,y);c.lineTo(w/2+half,y);c.stroke()}
  for(const div of[-.33,.33]){c.strokeStyle="rgba(220,225,198,.1)";c.beginPath();c.moveTo(w/2+div*w*.04,hy);c.lineTo(w/2+div*w*.38,gy);c.stroke()}
  for(let i=0;i<12;i++){const p=(i/12+travel*.7)%1,y=hy+Math.pow(p,1.6)*(gy-hy),s=.12+p*1.3,side=i%2?-1:1,x=w/2+side*w*(.09+p*.43);c.save();c.translate(x,y);c.fillStyle=i%3?"#365747":"#536a5c";c.beginPath();c.moveTo(-15*s,0);c.lineTo(-13*s,-72*s);c.lineTo(-9*s,-83*s);c.lineTo(11*s,-78*s);c.lineTo(15*s,0);c.closePath();c.fill();c.fillStyle="#10241c";c.fillRect(-7*s,-62*s,14*s,18*s);c.strokeStyle="rgba(190,205,180,.22)";c.lineWidth=Math.max(1,s);c.stroke();if(i%3===0){c.fillStyle="rgba(244,188,73,.16)";c.beginPath();c.arc(0,-72*s,29*s,0,Math.PI*2);c.fill();c.fillStyle="#d7a43c";c.beginPath();c.arc(0,-72*s,5*s,0,Math.PI*2);c.fill()}if(i%4===1){c.fillStyle="#183a2b";for(let j=0;j<5;j++){c.beginPath();c.ellipse((j-2)*11*s,-20*s-Math.abs(j-2)*9*s,20*s,8*s,-.5+j*.25,0,Math.PI*2);c.fill()}}c.restore()}
  if(run&&speed>18){c.strokeStyle="rgba(236,225,184,.13)";for(let i=0;i<18;i++){const x=(i*83%w),y=h*(.28+(i%7)*.095);c.lineWidth=1+(i%3);c.beginPath();c.moveTo(x,y);c.lineTo(x+(i%2?38:-38),y+36);c.stroke()}}
  const project=(l:number,z:number)=>{const p=Math.max(0,Math.min(1,(z+82)/86));return{x:w/2+l*w*.12*Math.pow(p,.95),y:hy+Math.pow(p,1.65)*(gy-hy),s:.1+Math.pow(p,1.6)*1.15}};
  [...hazards].sort((a,b)=>a.z-b.z).forEach(o=>{const p=project(o.lane,o.z),s=p.s;c.save();c.translate(p.x,p.y);c.shadowColor="rgba(0,0,0,.5)";c.shadowBlur=12*s;if(o.kind==="crate"){c.fillStyle="#51675b";c.fillRect(-46*s,-68*s,92*s,68*s);c.fillStyle="#d7a43c";c.fillRect(-49*s,-43*s,98*s,12*s);c.strokeStyle="#aebdaa";c.strokeRect(-46*s,-68*s,92*s,68*s)}else if(o.kind==="spikes"){c.fillStyle="#dfaa3d";for(let j=-2;j<=2;j++){c.beginPath();c.moveTo((j*19-10)*s,0);c.lineTo(j*19*s,-60*s);c.lineTo((j*19+10)*s,0);c.fill()}}else{c.fillStyle="#51675b";c.fillRect(-64*s,-140*s,22*s,140*s);c.fillRect(42*s,-140*s,22*s,140*s);c.fillRect(-64*s,-140*s,128*s,34*s);c.fillStyle="#d7a43c";c.fillRect(-41*s,-107*s,82*s,16*s)}c.restore()});
  relicList.forEach(r=>{if(r.taken)return;const p=project(r.lane,r.z),s=p.s,bob=Math.sin(visualTime*6+r.z)*6*s;c.save();c.translate(p.x,p.y-62*s+bob);c.rotate(visualTime*1.8);c.shadowColor="#f4bc49";c.shadowBlur=28*s;c.fillStyle="#ffce5e";c.beginPath();c.moveTo(0,-18*s);c.lineTo(15*s,0);c.lineTo(0,18*s);c.lineTo(-15*s,0);c.closePath();c.fill();c.strokeStyle="#fff0b4";c.lineWidth=2*s;c.stroke();c.restore()});
  drawFallbackRunner(c,w,h,run);
  sparks.forEach(s=>{const p=project(s.mesh.position.x/2.25,s.mesh.position.z);c.globalAlpha=Math.max(0,s.life);c.fillStyle="#ffd66e";c.beginPath();c.arc(p.x,p.y-s.mesh.position.y*18,3,0,Math.PI*2);c.fill()});c.globalAlpha=1;
}
function drawFallbackRunner(c:CanvasRenderingContext2D,w:number,h:number,running:boolean){
  const mobile=w<760,baseX=state==="ready"?(mobile?w*.5:w*.72):w/2+runner.position.x*w*.1,baseY=state==="ready"?(mobile?h*.63:h*.82):h*.84-jumpY*h*.13;
  const s=Math.max(.72,Math.min(1.25,w/1100))*(mobile?.78:1),t=visualTime*9,slidePose=slide>0;
  c.save();c.translate(baseX,baseY);c.scale(s,s);c.rotate(runner.rotation.z);c.fillStyle="rgba(0,0,0,.42)";c.beginPath();c.ellipse(0,jumpY*35,38*(1-jumpY*.12),11*(1-jumpY*.12),0,0,Math.PI*2);c.fill();
  c.translate(0,slidePose?16:0);c.rotate(slidePose?-.55:0);
  const swing=running?Math.sin(t)*19:0;c.lineCap="round";
  const limb=(x:number,y:number,cx:number,cy:number,x2:number,y2:number,width:number,color:string)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(cx,cy,x2,y2);c.stroke()};
  c.fillStyle="#7b241f";c.beginPath();c.moveTo(-21,-62);c.bezierCurveTo(-38,-39,-33,-4,-20,16);c.lineTo(0,3);c.lineTo(21,17);c.bezierCurveTo(34,-10,37,-44,20,-63);c.closePath();c.fill();
  c.fillStyle="#c34434";for(let i=0;i<3;i++){const wave=Math.sin(t+i)*8;c.beginPath();c.moveTo(-16+i*14,-28);c.bezierCurveTo(-20+i*14+wave,-3,-30+i*17+wave,25,-22+i*20+wave,46);c.lineTo(-10+i*14+wave,38);c.bezierCurveTo(-18+i*14+wave,8,-5+i*14,-12,-4+i*14,-30);c.fill()}
  limb(-11,-10,-20,3,-18-swing*.55,30,15,"#121916");limb(11,-10,20,3,18+swing*.55,30,15,"#121916");
  limb(-18-swing*.55,29,-23-swing*.4,34,-30-swing*.55,35,12,"#080d0b");limb(18+swing*.55,29,24+swing*.4,34,31+swing*.55,35,12,"#080d0b");
  limb(-22,-54,-34,-38,-30-swing*.42,-16+swing,13,"#a86f49");limb(22,-54,34,-38,30+swing*.42,-16-swing,13,"#a86f49");
  c.fillStyle="#a33129";c.beginPath();c.moveTo(-25,-69);c.quadraticCurveTo(0,-79,25,-69);c.lineTo(20,-18);c.quadraticCurveTo(0,-5,-20,-18);c.closePath();c.fill();
  const chest=c.createLinearGradient(-25,-65,25,-20);chest.addColorStop(0,"#e05b43");chest.addColorStop(1,"#8d2823");c.fillStyle=chest;c.beginPath();c.moveTo(-20,-65);c.quadraticCurveTo(0,-74,20,-65);c.lineTo(17,-23);c.quadraticCurveTo(0,-13,-17,-23);c.closePath();c.fill();
  c.fillStyle="#dca53b";c.beginPath();c.ellipse(-25,-61,10,7,-.25,0,Math.PI*2);c.ellipse(25,-61,10,7,.25,0,Math.PI*2);c.fill();c.fillRect(-20,-31,40,7);
  c.fillStyle="#a86f49";c.beginPath();c.ellipse(0,-90,17,20,0,0,Math.PI*2);c.fill();c.fillStyle="#e0a077";c.beginPath();c.ellipse(5,-88,7,10,-.15,0,Math.PI*2);c.fill();
  c.fillStyle="#16130f";c.beginPath();c.arc(0,-95,18,Math.PI,Math.PI*2);c.quadraticCurveTo(15,-100,17,-89);c.lineTo(10,-94);c.lineTo(-17,-90);c.closePath();c.fill();
  c.fillStyle="#dca53b";c.beginPath();c.moveTo(-3,-116);c.lineTo(3,-116);c.lineTo(7,-96);c.lineTo(0,-91);c.lineTo(-6,-96);c.closePath();c.fill();
  c.strokeStyle="#ffdb73";c.lineWidth=2;c.beginPath();c.moveTo(-13,-61);c.lineTo(13,-29);c.stroke();
  c.fillStyle="#ffce5e";c.save();c.translate(1,-46);c.rotate(Math.PI/4);c.fillRect(-7,-7,14,14);c.restore();
  c.strokeStyle="#e04a34";c.lineWidth=8;c.beginPath();c.moveTo(-12,-75);c.bezierCurveTo(-42,-79,-51+Math.sin(t)*9,-63,-66+Math.sin(t)*14,-73);c.stroke();c.strokeStyle="#f06a49";c.lineWidth=3;c.stroke();
  c.restore();
}
function render(now:number){const dt=(now-last)/1000;last=now;update(dt);if(renderer)renderer.render(scene,camera);else drawFallback();requestAnimationFrame(render)}
function resize(){const r=canvas.getBoundingClientRect();if(renderer)renderer.setSize(r.width,r.height,false);else{canvas.width=Math.round(r.width*devicePixelRatio);canvas.height=Math.round(r.height*devicePixelRatio)}camera.aspect=r.width/r.height;camera.fov=r.width/r.height<.8?64:51;camera.updateProjectionMatrix()}
function key(e:KeyboardEvent){setControlGuide("keyboard");if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Escape"].includes(e.key))e.preventDefault();if((e.key==="Enter"||e.key===" ")&&(state==="ready"||state==="gameover"))start(state==="gameover"?activeMode:dailyChallenge?"daily":"free");if(e.repeat)return;if(e.key.toLowerCase()==="p"||e.key==="Escape"){state==="paused"?resumeRun():pauseRun();return}if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a")move(-1);if(e.key==="ArrowRight"||e.key.toLowerCase()==="d")move(1);if(e.key==="ArrowUp"||e.key.toLowerCase()==="w"||e.key===" ")jump();if(e.key==="ArrowDown"||e.key.toLowerCase()==="s")duck()}
let sx=0,sy=0;canvas.addEventListener("pointerdown",e=>{sx=e.clientX;sy=e.clientY});canvas.addEventListener("pointerup",e=>{const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)<25&&Math.abs(dy)<25)return;if(Math.abs(dx)>Math.abs(dy))move(dx>0?1:-1);else dy<0?jump():duck()});
$("#start-button").addEventListener("click",()=>start(dailyChallenge?"daily":"free"));dailyButton.addEventListener("click",()=>start("daily"));$("#restart-button").addEventListener("click",()=>start(activeMode));pauseButton.addEventListener("click",()=>state==="paused"?resumeRun():pauseRun());resumeButton.addEventListener("click",resumeRun);$("#sound-toggle").addEventListener("click",()=>{audioOn=!audioOn;$("#sound-toggle span").textContent=audioOn?"◖":"○";if(audioOn)ping(430)});
shareButton.addEventListener("click",async()=>{
  shareButton.disabled=true;shareStatus.textContent="Opening share…";
  const result=await shareRunResult(Math.floor(distance),activeMode==="daily"?dailyKey:undefined);
  shareStatus.textContent=result.message;
  shareStatus.dataset.state=result.outcome;
  if(result.outcome==="shared"||result.outcome==="copied"){
    captureRunResultShared(renderer?"webgl":"canvas",activeRunNumber,activeMode,challengeTarget!==null,result.outcome==="shared"?"native":"clipboard",distance,relics);
  }
  shareButton.disabled=false;
});
document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(b=>b.addEventListener("pointerdown",e=>{e.preventDefault();const a=b.dataset.action;a==="left"?move(-1):a==="right"?move(1):a==="jump"?jump():duck()}));
addEventListener("keydown",key);addEventListener("resize",resize);addEventListener("focus",refreshDailyIntro);document.addEventListener("visibilitychange",()=>{last=performance.now();if(document.hidden)pauseRun(true);else refreshDailyIntro()});
setState("ready");refreshDailyIntro();resize();updateHud();requestAnimationFrame(render);captureGameOpened(renderer?"webgl":"canvas");
