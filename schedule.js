// 퐁당퐁당 나이트 — 시간표 규칙 (앱과 알림 서버가 같은 파일을 씀)
// 날짜는 항상 'YYYY-MM-DD' 문자열로 다룸 (시간대 영향 없음)
export const DEFAULT_BASE = '2026-10-01';
// 양력 고정 공휴일 + 2026 대체공휴일. 설·추석 등 음력 공휴일은 앱 설정의 '공휴일 직접 지정'으로 추가 (overrides[날짜]='holiday').
export const HOL = new Set(['2026-10-03','2026-10-05','2026-10-09','2026-12-25',
  '2027-01-01','2027-03-01','2027-05-05','2027-06-06','2027-08-15','2027-10-03','2027-10-09','2027-12-25',
  '2028-01-01','2028-03-01','2028-05-05','2028-06-06','2028-08-15','2028-10-03','2028-10-09','2028-12-25']);

const pad = n => String(n).padStart(2,'0');
export const hm = m => pad(Math.floor(m/60)%24)+':'+pad(m%60);
export const T = s => { const [h,m]=s.split(':').map(Number); return h*60+m; };
const utc = k => { const [y,m,d]=k.split('-').map(Number); return Date.UTC(y,m-1,d); };
export const addDaysKey = (k,n) => { const x=new Date(utc(k)+n*86400000); return x.getUTCFullYear()+'-'+pad(x.getUTCMonth()+1)+'-'+pad(x.getUTCDate()); };
export const dayDiff = (a,b) => Math.round((utc(b)-utc(a))/86400000);
export const dowOf = k => new Date(utc(k)).getUTCDay();
export const keyOfLocal = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());

export function isWork(k,cfg){ const n=dayDiff(cfg.base||DEFAULT_BASE,k); return ((n%2)+2)%2===0; }
// 그 날짜가 휴일(토·일·공휴일)인지
export function isHolidayDate(k,cfg){
  const o=(cfg.overrides||{})[k];
  if(o==='holiday') return true; if(o==='weekday') return false;
  const w=dowOf(k); return w===0||w===6||HOL.has(k);
}
// 출근 시간은 출근하는 날 기준: 휴일이면 17:30, 평일이면 20:30
export const isHolidayWork = (k,cfg) => isHolidayDate(k,cfg);
// 근무 정보 (근무일 k 기준). 퇴근 시간은 퇴근하는 날(k+1) 기준: 휴일이면 09:00, 평일이면 08:00
//  근무 중 확정 수면: 평일 근무 22:00~02:00, 휴일 근무 20:00~02:00
export function shiftInfo(k,cfg){
  const h=isHolidayWork(k,cfg), next=addDaysKey(k,1);
  return { holiday:h, start:h?1050:1230, sleepStart:h?1200:1320, sleepEnd:120, wakeAlarm:100,
           end: isHolidayDate(next,cfg)?540:480, defaultH: h?5:3.5 };
}

// ---- 근무 중 잠 → 퇴근일 계획 최적화 ----
// slept[퇴근일] = { h: 근무 중 잔 시간(시간), cut: 호출로 중간에 깼는지 }  (예전 값 'good'|'some'|'none'도 읽음)
const LEGACY = { good:{h:3.5,cut:false}, some:{h:2,cut:false}, none:{h:0.5,cut:false} };
export function shiftSleep(k,cfg){
  const si=shiftInfo(addDaysKey(k,-1),cfg), v=(cfg.slept||{})[k];
  if(v==null) return { h:si.defaultH, cut:false, e:si.defaultH, recorded:false };
  const o = typeof v==='string' ? (LEGACY[v]||LEGACY.some) : v;
  const h = Math.max(0, Math.min(7, +o.h||0)), cut=!!o.cut;
  // 중간에 끊긴 잠은 깊은 잠이 덜 들어가서 30분 덜 잔 것으로 계산
  return { h, cut, e: Math.max(0, h-(cut?0.5:0)), recorded:true };
}
const q15 = m => Math.round(m/15)*15;
export const fmtH = h => (Math.round(h*10)/10).toString().replace(/\.0$/,'')+'시간';
// 퇴근 후 잠 = 5.5시간 − 근무 중 잠 (최소 1.5시간 = 수면 한 주기, 최대 4시간)
//  → 01:40에 깨서 그날 밤 23시까지 21시간을 버텨야 하니 짧게라도 한 주기는 자고,
//    4시간을 넘겨 그날 밤잠을 망치지는 않게
export function offPlan(k,cfg){
  const s=shiftSleep(k,cfg), si=shiftInfo(addDaysKey(k,-1),cfg);
  const post=q15(Math.max(1.5, Math.min(4, 5.5-s.e))*60);
  const endMin=si.end, homeMin=endMin+90, sleepStart=homeMin+30, wakeMin=sleepStart+post;
  const level = s.e>=3 ? 'good' : s.e>=1 ? 'some' : 'low';
  const bedMin = level==='low' ? 1350 : 1380;            // 거의 못 잤으면 30분 일찍 취침
  return { ...s, postH:post/60, endMin, homeMin, sleepStart, wakeMin, bedMin, level, total: s.e + post/60,
           prevSleepStart: si.sleepStart, defaultH: si.defaultH };
}

const WPRE = [
  ['wake','07:30','기상 · 햇빛','아침 햇빛 쬐기. 오늘 밤 22시에 잘 잠들려면 낮에 제대로 깨어 있어야 해.'],
  ['nap','12:40','낮잠은 정말 피곤할 때만 (20분)','오늘 22:00~02:00 수면이 확보돼 있어. 낮에 자면 22시에 잠이 안 와. 버틸 만하면 건너뛰기.'],
  ['cafcut','15:00','카페인 마감','22시 수면 대비로 지금부터 커피 금지.'],
  ['dinner','18:00','저녁 든든하게','새벽에 안 먹으려면 지금 제대로 먹어두기.'],
  ['depart','18:40','출발 준비','선글라스, 수면 키트, 간식(견과류 등) 챙기고 18:50 출발.'],
  ['shift','20:30','근무 시작','22:00 수면 전까지 일 마무리. 조명은 너무 밝지 않게.'],
  ['bonus','21:45','22:00 수면 시작','02:00까지 확보된 수면 시간. 알람 01:40 맞추고 눕기. 수면안대, 귀마개는 한쪽만, 폰은 진동. 앱에서 「지금 눕기」 누르기.']
];
const HPRE = [
  ['wake','07:30','기상 · 햇빛 (휴일 근무날)','오늘은 17:30 출근. 20:00에 잘 잠들려면 낮잠 없이 버티는 게 좋아.'],
  ['cafcut','13:00','카페인 마감','오늘은 20:00에 자니까 평소보다 2시간 일찍 커피 끊기.'],
  ['dinner','14:45','이른 저녁 든든하게','새벽 식사 대신 지금 제대로. 20시 전에 출출하면 가볍게만.'],
  ['depart','15:50','출발 준비','선글라스, 수면 키트, 간식 챙기고 16:00 출발.'],
  ['shift','17:30','근무 시작','20:00 수면 전까지 일 마무리.'],
  ['bonus','19:45','20:00 수면 시작','02:00까지 6시간 확보. 알람 01:40 맞추고 눕기. 수면안대, 귀마개는 한쪽만, 폰은 진동. 앱에서 「지금 눕기」 누르기.']
];
function mornItems(k,cfg){
  const P=offPlan(k,cfg), E=P.endMin;
  return [
    ['bonuswake','01:40','기상 · 02시 복귀 준비','밝은 조명, 찬물 세수, 물 한 모금. 5~10분 몸 깨우고 환자 확인부터. 앱에서 「일어났어」 누르기. 커피는 반 잔까지만.'],
    ['cafcut2','03:00','카페인 마감 · 실수 주의 구간','03~05시는 각성도 바닥. 환자 확인, 조영제 병력, 검사 부위 한 번 더. 새벽엔 물·무가당 우유·견과류까지만.'],
    ['water',hm(E-120),'물 줄이기 · 근무 중 잠 확인','퇴근 후 화장실 때문에 깨지 않게 물 줄이기. 근무 중 잔 시간이 앱에 맞게 기록됐는지 확인하면 퇴근 후 계획이 맞춰져.'],
    ['leave',hm(E-10),'퇴근 준비 · 세안 · 선크림','병원에서 세안 → 로션 → 선크림, 선글라스 챙기기. 졸림 점수(1~9) 체크해서 7 이상이면 운전 전에 15~20분 쪽잠.']
  ];
}
function offItems(k,cfg){
  const P=offPlan(k,cfg), w=hm(P.wakeMin), st=hm(P.sleepStart);
  const why = P.recorded ? `근무 중 ${fmtH(P.h)}${P.cut?'(중간에 깸)':''} 잤으니` : `근무 중 잠 기록 전이라 ${fmtH(P.defaultH)} 기준으로`;
  const low=P.level==='low', good=P.level==='good';
  return [
    ['home',hm(P.homeMin),'귀가 → 바로 잘 준비',`${why} 오늘은 ${st}~${w}, ${fmtH(P.postH)} 자. 클렌징워터로 선크림만 닦고 바로 눕기. 완전 암막.`],
    ['wakeoff',w,'기상 · 바로 햇빛', `${fmtH(P.postH)} 잤으면 충분해. 더 자면 오늘 밤잠이 밀려. 바깥 햇빛 20~30분으로 리듬을 낮으로 되돌리기.`+(low?' 오늘은 잠이 부족한 날이라 오후에 졸리면 15시 전까지 20분만 눈 붙여도 돼.':' 오후 낮잠은 참기.')],
    ['exercise','17:00', low?'가벼운 운동':'운동', low ? '근무 중 거의 못 잔 날엔 고강도 운동은 쉬고 걷기 20~30분만. 회복이 우선이야.' : good ? '근무 중에 잘 잤어. 근력 운동 하기 좋은 날.' : '근력 2회 + 유산소 1~2회 섞기. 자기 직전 2~3시간은 피하기.'],
    ['nightprep', low?'20:45':'21:00','밤잠 사수 준비', low ? '오늘은 30분 일찍 자는 날. 약속은 21시 전 종료, 카페인·격한 운동 금지.' : '약속은 22시 전 종료. 카페인, 격한 운동 금지.'],
    ['bed', low?'22:10':'22:40', low?'22시 30분 취침':'23시 취침', low ? '부족했던 잠은 오늘 밤에 30분 더 자서 채우기. 내일 07:30 기상.' : '쉬는 날 밤잠이 건강의 기준점. 내일 07:30 기상.']
  ];
}
export function itemsFor(k,cfg){
  const arr = isWork(k,cfg) ? (isHolidayWork(k,cfg)?HPRE:WPRE) : mornItems(k,cfg).concat(offItems(k,cfg));
  return arr.map(([id,t,title,desc])=>({id,min:T(t),title,desc,date:k,key:k+'@'+T(t)})).sort((a,b)=>a.min-b.min);
}
export function blocksFor(k,cfg){
  if(isWork(k,cfg)){
    const si=shiftInfo(k,cfg), e=shiftSleep(addDaysKey(k,1),cfg).e;
    const b=[[0,450,'sleep'],[si.start,1440,'shift']];
    if(!si.holiday) b.push([760,780,'nap']);
    if(e>0) b.push([si.sleepStart, Math.min(1440, si.sleepStart+e*60), 'nap']);
    return b;
  }
  const P=offPlan(k,cfg), after=Math.max(0, P.prevSleepStart+P.e*60-1440);
  const b=[[0,P.endMin,'shift'],[P.sleepStart,P.wakeMin,'sleep'],[P.bedMin,1440,'sleep']];
  if(after>0) b.push([0,Math.min(after,P.endMin),'nap']);
  return b;
}

// 알림 종류 (설정에서 켜고 끄기)
export const ALERT_TYPES = [
  ['wake','아침 기상 · 햇빛'],['nap','낮잠 (평일 근무날, 선택)'],['cafcut','카페인 마감 (낮)'],['dinner','출근 전 저녁'],
  ['depart','출발 준비'],['shift','근무 시작'],['bonus','근무 중 수면 시작 (평일 22시 · 휴일 20시)'],['bonuswake','01:40 기상'],
  ['cafcut2','03시 카페인 마감 · 실수 주의'],['water','퇴근 2시간 전 물 줄이기'],['leave','퇴근 준비 · 선크림 · 졸림 체크'],
  ['home','귀가 → 잘 준비'],['wakeoff','퇴근 후 기상'],['exercise','운동'],['nightprep','밤잠 준비'],['bed','밤 취침 (23시, 못 잔 날 22:30)']
];
export const CORE_ALERTS = ['cafcut','depart','bonus','bonuswake','leave','wakeoff','bed'];
export function alertItemsFor(k,cfg){ const m=new Set(cfg.muted||[]); return itemsFor(k,cfg).filter(i=>!m.has(i.id)); }
// 알림 → 실제로 눕는 시각까지 남은 분 (카페인 계산용)
export const SLEEP_OFFSET = { bonus:15, home:30, bed:20 };
