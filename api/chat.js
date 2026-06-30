const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

function buildSystemPrompt(manual) {
  return `너는 사용자가 등록한 [매뉴얼]을 근거로 답변하는 한국어 챗봇이다.

[매우 중요한 규칙]
1) 매뉴얼이 1인칭(나/내/제/저)으로 쓰여 있다면, 그것은 "이 매뉴얼을 등록한 사람"의 정보다. 그 주체의 정보로 인식하고 자연스럽게 3인칭이나 적절한 표현으로 답해라. (예: 매뉴얼에 "나는 매일 아침 8시에 출근한다"라고 있으면 "네, 매일 아침 8시에 출근하십니다"처럼 답한다.)
2) 매뉴얼에 직접 적힌 내용이 아니더라도, 매뉴얼로부터 합리적으로 유추 가능한 것은 적극적으로 답해라. 너무 보수적으로 거절하지 마라.
3) 매뉴얼과 정말로 아무 관련이 없는 질문일 때에만 "정보를 찾을 수 없습니다"라고 답해라.
4) 답변은 카카오톡 채팅처럼 간결하고 친근하게. 불필요한 머리말("물론입니다", "네, 알겠습니다" 같은 말)과 마크다운 기호(**, ##, - 등)는 쓰지 마라. 길어도 4~6문장 이내로.
5) 매뉴얼에 없는 정보를 지어내지 마라.

[매뉴얼]
${manual}`;
}

function extractText(data) {
  try {
    const cands = data && data.candidates;
    if (!cands || !cands.length) return '';
    const parts = cands[0].content && cands[0].content.parts;
    if (!parts || !parts.length) return '';
    return parts.map((p) => p.text || '').join('').trim();
  } catch (_) {
    return '';
  }
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const manual = process.env.MANUAL_TEXT;

  if (!apiKey) {
    res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다.' });
    return;
  }
  if (!manual) {
    res.status(500).json({ error: '서버에 MANUAL_TEXT가 설정되지 않았습니다.' });
    return;
  }

  const body = await readJsonBody(req);
  const question = (body && typeof body.question === 'string') ? body.question.trim() : '';
  if (!question) {
    res.status(400).json({ error: '질문이 비어있습니다.' });
    return;
  }

  try {
    const payload = {
      systemInstruction: { parts: [{ text: buildSystemPrompt(manual) }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
    };

    const upstream = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      let detail = `HTTP ${upstream.status}`;
      try {
        const errJson = await upstream.json();
        if (errJson && errJson.error && errJson.error.message) detail = errJson.error.message;
      } catch (_) {}
      res.status(502).json({ error: 'Gemini 호출 실패: ' + detail });
      return;
    }

    const data = await upstream.json();
    const reply = extractText(data);
    if (!reply) {
      if (data && data.promptFeedback && data.promptFeedback.blockReason) {
        res.status(502).json({ error: '응답이 차단되었어요 (' + data.promptFeedback.blockReason + ')' });
        return;
      }
      res.status(502).json({ error: '빈 응답을 받았어요' });
      return;
    }

    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ error: (err && err.message) ? err.message : '서버 오류' });
  }
};
