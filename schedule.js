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
//  근무 중 수면: 평일 근무 22:00~05:00, 휴일 근무 20:00~05:00 (02~05시는 콜 대기하면서 수면), 04:45 기상
export function shiftInfo(k,cfg){
  const h=isHolidayWork(k,cfg), next=addDaysKey(k,1);
  return { holiday:h, start:h?1050:1230, sleepStart:h?1200:1320, sleepEnd:300, wakeAlarm:285,
           end: isHolidayDate(next,cfg)?540:480, defaultH: h?6.5:5 };
}
export const WAKE_MIN = 480;     // 근무일 기상 08:00

// ---- 근무 중 잠 → 퇴근일 계획 최적화 ----
// slept[퇴근일] = { h: 근무 중 누워 있던 시간(시간), calls: 콜로 깬 횟수 }
//  (예전 값: 'good'|'some'|'none', {h, cut:true} 도 읽음)
const LEGACY = { good:{h:3.5,calls:0}, some:{h:2,calls:0}, none:{h:0.5,calls:0} };
export const CALL_COST = 20/60;   // 콜 한 번에 잠 20분 손해로 계산 (깨서 일하고 다시 잠드는 시간)
export function shiftSleep(k,cfg){
  const si=shiftInfo(addDaysKey(k,-1),cfg), v=(cfg.slept||{})[k];
  if(v==null) return { h:si.defaultH, calls:0, e:si.defaultH, recorded:false };
  const o = typeof v==='string' ? (LEGACY[v]||LEGACY.some) : v;
  const h = Math.max(0, Math.min(9, +o.h||0));
  const calls = Math.max(0, Math.min(10, o.calls!=null ? +o.calls||0 : (o.cut?1:0)));
  return { h, calls, e: Math.max(0, h - calls*CALL_COST), recorded:true };
}
const q15 = m => Math.round(m/15)*15;
export const fmtH = h => (Math.round(h*10)/10).toString().replace(/\.0$/,'')+'시간';
// 퇴근 후 잠 = 5.5시간 − 근무 중 잠 (최소 1.5시간 = 수면 한 주기, 최대 4시간)
export function offPlan(k,cfg){
  const s=shiftSleep(k,cfg), si=shiftInfo(addDaysKey(k,-1),cfg);
  const post=q15(Math.max(1.5, Math.min(4, 5.5-s.e))*60);
  const endMin=si.end, homeMin=endMin+90, sleepStart=homeMin+30, wakeMin=sleepStart+post;
  const level = s.e>=4.5 ? 'good' : s.e>=2.5 ? 'some' : 'low';
  const bedMin = level==='low' ? 1410 : 1440;            // 기본 24:00, 많이 못 잤으면 23:30
  return { ...s, postH:post/60, endMin, homeMin, sleepStart, wakeMin, bedMin, level, total: s.e + post/60,
           prevSleepStart: si.sleepStart, defaultH: si.defaultH };
}
export const bedLabel = m => m>=1440 ? '24:00' : hm(m);

// 항목: [id, 시각, 제목, 설명, 'q'(알림 없이 시간표에만)]
const WPRE = [
  ['wake','08:00','기상 · 햇빛 · 체중','화장실 다녀와서 체중 재기 (출근일 아침에만). 햇빛 10분. 아침은 단백질 위주로 (계란 3개 + 밥 반 공기 등).'],
  ['study','09:00','스카 · 집중 작업','하루 중 머리가 제일 맑은 시간. 발표 준비처럼 생각이 필요한 일을 여기에.','q'],
  ['swim','11:00','수영 (가볍게~중간)','말할 수 있을 정도 강도로 30~40분. 오후에 무거운 운동이 있으니 여기서 힘 빼지 않기.','q'],
  ['lunch','12:00','점심 · 가장 큰 끼니','밥 1공기 + 고기나 생선 150g + 채소.','q'],
  ['nap','12:40','낮잠 20분 (선택)','22시에 잘 잠들려면 낮잠은 20분까지만. 알람 필수. 버틸 만하면 건너뛰기.'],
  ['study2','13:00','스카','정리·복습·자료 만들기처럼 가벼운 작업.','q'],
  ['cafcut','15:00','카페인 마감','운동 전 커피도 지금이 마지막. 22시 수면 대비.'],
  ['gym','16:00','헬스 · 무거운 날','Push → Pull → Legs 순서. 10개 할 수 있는 무게로 8개에서 멈추기. 60~75분.'],
  ['dinner','18:00','저녁 (운동 후)','밥 2/3~1공기 + 단백질 반찬 + 채소. 새벽엔 안 먹으니까 지금 든든하게.'],
  ['depart','18:45','출발 준비','선글라스, 수면 키트, 물병 챙기고 19:00 출발.'],
  ['shift','20:30','근무 시작','22:00 수면 전까지 일 마무리.','q'],
  ['bonus','21:45','22:00 수면 시작','05:00까지 잘 수 있어. 02시부터는 콜 대기하면서 자기. 알람 04:45. 수면안대, 귀마개는 한쪽만, 폰은 진동. 앱에서 「지금 눕기」.']
];
const HPRE = [
  ['wake','08:00','기상 · 햇빛 · 체중 (휴일 근무날)','체중 재기, 햇빛 10분, 단백질 아침. 오늘은 17:30 출근, 20:00 수면.'],
  ['study','09:00','스카 · 집중 작업','머리가 제일 맑은 시간. 생각이 필요한 일을 여기에.','q'],
  ['swim','11:00','수영 (가볍게~중간)','30~40분, 말할 수 있을 정도 강도. 1시간 뒤 무거운 운동이 있어.','q'],
  ['lunch','12:00','점심 · 가장 큰 끼니','밥 1공기 + 고기나 생선 150g + 채소.','q'],
  ['cafcut','12:45','카페인 마감','오늘은 20:00에 자니까 운동 전 커피도 지금이 마지막.'],
  ['gym','13:15','헬스 · 무거운 날','Push → Pull → Legs 순서. 10개 할 수 있는 무게로 8개에서 멈추기. 60~75분.'],
  ['dinner','14:45','이른 저녁 (운동 후)','밥 2/3~1공기 + 단백질 반찬 + 채소.'],
  ['depart','15:50','출발 준비','선글라스, 수면 키트, 단백질 간식 챙기고 16:00 출발.'],
  ['shift','17:30','근무 시작','20:00 수면 전까지 일 마무리.','q'],
  ['snack','19:15','단백질 간식','그릭요거트나 단백질 음료 정도. 자기 전이라 가볍게.','q'],
  ['bonus','19:45','20:00 수면 시작','05:00까지 잘 수 있어. 02시부터는 콜 대기하면서 자기. 알람 04:45. 수면안대, 귀마개는 한쪽만, 폰은 진동. 앱에서 「지금 눕기」.']
];
function mornItems(k,cfg){
  const P=offPlan(k,cfg), E=P.endMin;
  return [
    ['bonuswake','04:45','기상 · 05시 업무 복귀','밝은 조명, 찬물 세수, 물 한 모금. 5~10분 몸 깨우고 시작. 05~07시는 각성도 바닥이라 환자 확인·조영제 병력·검사 부위 한 번 더. 앱에서 「일어났어」, 콜로 깬 횟수도 기록. 커피는 반 잔까지만.'],
    ['water',hm(E-120),'물 줄이기','퇴근 후 잠이 화장실 때문에 끊기지 않게. 01~06시 공복은 그대로.'],
    ['leave',hm(E-10),'퇴근 준비 · 세안 · 선크림','병원에서 세안 → 토너 → 크림 → 선크림, 선글라스. 졸림 점수(1~9) 체크해서 7 이상이면 운전 전에 15~20분 쪽잠.']
  ];
}
function offItems(k,cfg){
  const P=offPlan(k,cfg), w=P.wakeMin, st=hm(P.sleepStart);
  const why = P.recorded ? `근무 중 ${fmtH(P.e)} 잔 셈이니${P.calls?` (콜 ${P.calls}번 반영)`:''}` : `근무 중 잠 기록 전이라 ${fmtH(P.defaultH)} 기준으로`;
  const low=P.level==='low', good=P.level==='good';
  const meal=Math.max(w+45, 0), study=Math.max(meal+45, 0);
  return [
    ['home',hm(P.homeMin),'귀가 → 단백질 → 바로 잠',`${why} 오늘은 ${st}~${hm(w)}, ${fmtH(P.postH)} 자. 자기 전 단백질 25g (프로틴 1스쿱이나 그릭요거트). 클렌징워터로 닦고 크림 한 겹, 바로 눕기. 완전 암막.`],
    ['wakeoff',hm(w),'기상 · 햇빛 보며 걷기 30분', `${fmtH(P.postH)}이면 충분해. 더 자면 오늘 밤잠이 밀려. 일어나면 토너 → 로션 → 크림 → 선크림 하고 바깥에서 걷기.`+(low?' 콜이 많았던 날이라 졸리면 15시 전까지 20분만 눈 붙여도 돼.':'')],
    ['meal',hm(meal),'첫 끼 · 큰 끼니','밥 1공기 + 고기나 생선 + 채소.','q'],
    ['study3',hm(study),'스카','짧게 자고 일어난 날이라 정리·복습 같은 가벼운 작업 위주.','q'],
    ['snack','16:00','간식','그릭요거트나 두유 + 계란 2개. 수영 3시간 전.','q'],
    ['exercise','19:00', low?'산책 20분 (수영 쉬기)':'수영', low ? '근무 중에 많이 못 잔 날이야. 수영은 쉬고 가볍게 걷기만. 무리하면 근육보다 피로만 쌓여.' : '오늘의 운동은 이거 하나. 40~50분, 숨이 차도 말은 할 수 있는 정도. 헬스는 쉬는 날이야.'],
    ['dinner2','20:15','저녁 · 가장 큰 끼니','고기나 생선 200g + 밥 2/3공기 + 채소. 01~06시는 공복이니 이후 야식 금지.','q'],
    ['nightprep', low?'22:30':'23:00','밤잠 준비','화면 밝기 낮추기. 클렌징 → 토너 → 로션 → 크림. 카페인·격한 활동 금지.'],
    ['bed', low?'23:10':'23:40', low?'23:30 취침':'24:00 취침', low ? '부족했던 잠은 오늘 밤 30분 일찍 자서 채우기. 내일 08:00 기상.' : '이 밤잠이 이틀 리듬의 기준점. 내일 08:00 기상.']
  ];
}
const toItems = (arr,k) => arr.map(([id,t,title,desc,q])=>({id,min:T(t),title,desc,quiet:q==='q',date:k,key:k+'@'+T(t)})).sort((a,b)=>a.min-b.min);
export function itemsFor(k,cfg){
  return toItems(isWork(k,cfg) ? (isHolidayWork(k,cfg)?HPRE:WPRE) : mornItems(k,cfg).concat(offItems(k,cfg)), k);
}
export function blocksFor(k,cfg){
  if(isWork(k,cfg)){
    const si=shiftInfo(k,cfg);
    const b=[[0,WAKE_MIN,'sleep'],[si.start,1440,'shift'],[si.sleepStart,1440,'nap']];
    if(!si.holiday) b.push([760,780,'nap']);
    return b;
  }
  const P=offPlan(k,cfg);
  const b=[[0,P.endMin,'shift'],[0,300,'nap'],[P.sleepStart,P.wakeMin,'sleep']];
  if(P.bedMin<1440) b.push([P.bedMin,1440,'sleep']);
  return b;
}

// 알림 종류 (설정에서 켜고 끄기). 'q' 항목(스카·식사 등)은 시간표에만 보이고 알림은 안 옴
export const ALERT_TYPES = [
  ['wake','아침 기상 · 체중 (08:00)'],['nap','낮잠 20분 (평일 근무날)'],['cafcut','카페인 마감 (낮)'],['gym','헬스 (근무날)'],['dinner','출근 전 저녁'],
  ['depart','출발 준비'],['bonus','근무 중 수면 시작 (평일 22시 · 휴일 20시)'],['bonuswake','04:45 기상'],
  ['water','퇴근 2시간 전 물 줄이기'],['leave','퇴근 준비 · 선크림 · 졸림 체크'],
  ['home','귀가 → 단백질 → 잠'],['wakeoff','퇴근 후 기상'],['exercise','퇴근일 수영'],['nightprep','밤잠 준비 · 스킨케어'],['bed','밤 취침 (24시, 못 잔 날 23:30)']
];
export const CORE_ALERTS = ['cafcut','depart','bonus','bonuswake','leave','wakeoff','bed'];
export function alertItemsFor(k,cfg){ const m=new Set(cfg.muted||[]); return itemsFor(k,cfg).filter(i=>!i.quiet && !m.has(i.id)); }
// 알림 → 실제로 눕는 시각까지 남은 분 (카페인 계산용)
export const SLEEP_OFFSET = { bonus:15, home:30, bed:20 };
