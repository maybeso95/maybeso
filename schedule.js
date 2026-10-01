// 퐁당퐁당 나이트 — 시간표 규칙 (앱과 알림 서버가 같은 파일을 씀)
// 날짜는 항상 'YYYY-MM-DD' 문자열로 다룸 (시간대 영향 없음)
export const DEFAULT_BASE = '2026-10-01';
// 양력 고정 공휴일 + 2026 대체공휴일. 설·추석 등 음력 공휴일은 앱에서 '휴일 근무'로 직접 지정.
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
export function isHolidayWork(k,cfg){
  const o=(cfg.overrides||{})[k]||'auto';
  if(o==='weekday') return false; if(o==='holiday') return true;
  const w=dowOf(k); return w===0||w===6||HOL.has(k);
}

export const WAKE = {good:['12:00','3시간 이상'], some:['13:00','1~3시간'], none:['13:45','거의 못 잠']};
const WPRE = [
  ['wake','07:30','기상 · 햇빛','아침 햇빛 쬐기. 오늘 밤 22시에 졸리려면 지금 제대로 깨어 있어야 해.'],
  ['nap','12:40','보험 낮잠 20분 (선택)','근무 중 잠은 보너스라서 피곤하면 20분만. 길게 자면 22시 잠이 날아가.'],
  ['cafcut','15:00','카페인 마감','22시 수면 대비로 지금부터 커피 금지.'],
  ['dinner','18:00','저녁 든든하게','새벽에 안 먹으려면 지금 제대로 먹어두기.'],
  ['depart','18:40','출발 준비','선글라스, 수면 키트, 간식(견과류 등) 챙기고 18:50 출발.'],
  ['shift','20:30','근무 시작','조명은 너무 밝지 않게. 22시 잠 기회가 오면 잡기.']
];
const HPRE = [
  ['wake','07:30','기상 · 햇빛 (휴일 근무날)','오늘은 17:30 출근, 근무 14시간 반.'],
  ['nap','13:00','보험 낮잠 20~30분','휴일 근무는 길어서 낮잠 우선순위가 높아. 30분은 넘기지 않기.'],
  ['dinner','14:30','이른 저녁 든든하게','새벽 식사 대신 지금 제대로.'],
  ['cafcut','15:00','카페인 마감','22시 수면 대비.'],
  ['depart','15:50','출발 준비','선글라스, 수면 키트, 간식 챙기고 16:00 출발.'],
  ['shift','17:30','근무 시작','긴 근무라 22시 잠 기회가 오면 꼭 잡기.']
];
const EVE = [
  ['bonus','21:45','22시 잘 수 있으면 눕기','여건 되면 22:00에 눕고 알람 01:45. 수면안대, 귀마개는 한쪽만, 폰은 진동. 배고프면 지금 가볍게 먹기.']
];
const MORN = [
  ['bonuswake','01:45','기상 (잤다면)','밝은 조명, 찬물 세수, 물 한 모금. 호출 직후엔 1~2분 몸 깨우고 환자 확인부터. 커피는 반 잔까지만.'],
  ['cafcut2','03:00','카페인 마감 · 실수 주의 구간','03~05시는 각성도 바닥. 환자 확인, 조영제 병력, 검사 부위 한 번 더. 새벽엔 물·무가당 우유·견과류까지만.'],
  ['water','06:00','물 줄이기 · 잠 기록','퇴근 후 화장실 때문에 깨지 않게 물 줄이기. 근무 중 몇 시간 잤는지 기억해두기.'],
  ['leave','07:50','퇴근 준비 · 선글라스','아침 햇빛 차단. 앱 기록 탭에서 지금 졸림 점수(1~9)를 체크해봐. 7 이상이면 운전 전에 15~20분 쪽잠.']
];
function offItems(k,cfg){
  const w = WAKE[(cfg.slept||{})[k]||'some'];
  return [
    ['home','09:30','귀가 → 바로 잘 준비','가볍게 먹고 씻고 폰 내려놓기. 완전 암막. 앱에서 근무 중 수면 길이를 골라두면 기상 알림이 맞춰져.'],
    ['wakeoff',w[0],'기상 · 바로 햇빛','근무 중 수면 '+w[1]+' 기준 기상. 바깥 햇빛 20~30분으로 리듬을 낮으로 되돌리기. 오후 낮잠은 참기.'],
    ['exercise','17:00','운동','근력 2회 + 유산소 1~2회 섞기. 자기 직전 2~3시간은 피하기.'],
    ['nightprep','21:00','밤잠 사수 준비','약속은 22시 전 종료. 카페인, 격한 운동 금지.'],
    ['bed','22:40','23시 취침','쉬는 날 밤잠이 건강의 기준점. 내일 07:30 기상.']
  ];
}
export function itemsFor(k,cfg){
  const arr = isWork(k,cfg) ? (isHolidayWork(k,cfg)?HPRE:WPRE).concat(EVE) : MORN.concat(offItems(k,cfg));
  return arr.map(([id,t,title,desc])=>({id,min:T(t),title,desc,date:k,key:k+'@'+T(t)})).sort((a,b)=>a.min-b.min);
}
export function blocksFor(k,cfg){
  if(isWork(k,cfg)){
    const h=isHolidayWork(k,cfg);
    return [[0,450,'sleep'],[h?1050:1230,1440,'shift'],[1320,1440,'nap'], h?[780,810,'nap']:[760,780,'nap']];
  }
  const w=T(WAKE[(cfg.slept||{})[k]||'some'][0]);
  return [[0,480,'shift'],[0,120,'nap'],[600,w,'sleep'],[1380,1440,'sleep']];
}

// 알림 종류 (설정에서 켜고 끄기)
export const ALERT_TYPES = [
  ['wake','아침 기상 · 햇빛'],['nap','보험 낮잠'],['cafcut','카페인 마감 (오후)'],['dinner','출근 전 저녁'],
  ['depart','출발 준비'],['shift','근무 시작'],['bonus','22시 잠 기회'],['bonuswake','01:45 기상'],
  ['cafcut2','03시 카페인 마감 · 실수 주의'],['water','06시 물 줄이기'],['leave','퇴근 준비 · 졸림 체크'],
  ['home','귀가 → 잘 준비'],['wakeoff','퇴근 후 기상'],['exercise','운동'],['nightprep','밤잠 준비'],['bed','23시 취침']
];
export const CORE_ALERTS = ['cafcut','depart','bonus','cafcut2','leave','wakeoff','bed'];
export function alertItemsFor(k,cfg){ const m=new Set(cfg.muted||[]); return itemsFor(k,cfg).filter(i=>!m.has(i.id)); }
// 잠 시작 시각 (카페인 계산용): 알림 id → 실제로 눕는 시각
export const SLEEP_STARTS = { nap:[12,40], bonus:[22,0], home:[10,0], bed:[23,0] };
