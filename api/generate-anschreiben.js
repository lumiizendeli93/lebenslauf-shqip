export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const profil = body.profil || {};
    const stelle = body.stelle || {};

    const unternehmen = clip(stelle.unternehmen, 200);
    const position = clip(stelle.position, 200);
    if (!unternehmen || !position) {
      return res.status(400).json({ error: 'unternehmen und position sind erforderlich' });
    }

    const payload = {
      beruf: clip(profil.beruf, 200),
      erfahrung: toArray(profil.erfahrung).slice(0, 8).map(e => ({
        role: clip(e && e.role, 150),
        company: clip(e && e.company, 150),
        desc: clip(e && e.desc, 500),
        from: clip(e && e.from, 30),
        to: clip(e && e.to, 30)
      })),
      ausbildung: toArray(profil.ausbildung).slice(0, 6).map(e => ({
        degree: clip(e && e.degree, 200),
        school: clip(e && e.school, 200)
      })),
      kenntnisse: toArray(profil.kenntnisse).slice(0, 20).map(s => clip(s, 100)).filter(Boolean),
      soft: toArray(profil.soft).slice(0, 20).map(s => clip(s, 100)).filter(Boolean),
      sprachen: toArray(profil.sprachen).slice(0, 10).map(l => ({
        name: clip(l && l.name, 60),
        level: clip(l && l.level, 60)
      })),
      unternehmen,
      position,
      ort: clip(stelle.ort, 150),
      quelle: clip(stelle.quelle, 150),
      motivation: clip(body.motivation, 800)
    };

    const userPrompt = buildPrompt(payload);

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      throw new Error('AI request failed: ' + aiRes.status + ' ' + errText.slice(0, 300));
    }

    const aiData = await aiRes.json();
    const text = (aiData.content || []).map(b => b.text || '').join('').trim();
    const paragraphs = extractParagraphs(text);

    if (!paragraphs.length) throw new Error('Leere KI-Antwort');

    res.status(200).json({ paragraphs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

const SYSTEM_PROMPT = 'Du bist ein professioneller Bewerbungscoach. Du schreibst ausschließlich den Fließtext (Hauptteil) eines deutschen Bewerbungsschreibens (Anschreiben) im formellen Sie-Stil. ' +
  'Schreibe NICHT die Anrede ("Sehr geehrte Damen und Herren") und NICHT den Schlussgruß ("Mit freundlichen Grüßen") — diese werden separat hinzugefügt. ' +
  'Antworte AUSSCHLIESSLICH mit validem JSON in der Form {"paragraphs": ["Absatz 1", "Absatz 2", "Absatz 3", "Absatz 4"]} ohne weiteren Text, ohne Markdown-Codeblock. ' +
  'Schreibe 3 bis 4 Absätze: (1) überzeugender Einstieg mit Bezug auf Position, Unternehmen und Quelle der Ausschreibung, (2) relevante Berufserfahrung/Ausbildung/Fähigkeiten passend zur Stelle, (3) Motivation für gerade dieses Unternehmen, (4) kurzer Schlusssatz mit Wunsch nach einem persönlichen Gespräch. ' +
  'Nutze ausschließlich die gegebenen Fakten, erfinde keine neuen Tätigkeiten oder Qualifikationen.\n\n' +
  'GANZ WICHTIG — das Ergebnis darf NICHT nach KI klingen. Personalverantwortliche erkennen KI-Texte inzwischen sehr leicht an bestimmten Mustern. Vermeide daher strikt:\n' +
  '- Textbaustein-Formulierungen wie "In der heutigen schnelllebigen Welt", "Ich bin überzeugt, dass ich die ideale Ergänzung für Ihr Team bin", "einen wertvollen Beitrag leisten", "meine Leidenschaft für...", "auf eine Reise begeben", "es ist mir eine Freude"\n' +
  '- Aufzählungs-Rhythmus, bei dem jeder Satz exakt gleich aufgebaut ist oder mit Konnektoren wie "Darüber hinaus", "Zudem", "Des Weiteren" beginnt (höchstens einmal im ganzen Text verwenden)\n' +
  '- Übertriebene, glatte Superlative ("herausragend", "einzigartig", "leidenschaftlich", "hochmotiviert") — normale, ehrliche Formulierungen wirken glaubwürdiger\n' +
  '- Perfekt symmetrische Satzlängen — variiere bewusst zwischen kurzen und längeren Sätzen, wie ein Mensch beim Schreiben es tun würde\n' +
  '- Übergänge, die zu glatt/werblich klingen; schreib stattdessen konkret und sachlich, mit Bezug auf echte Details aus dem Profil (Firmennamen, Tätigkeiten, Zeiträume) statt vager Phrasen\n' +
  'Schreibe stattdessen so, wie eine reale Person es tun würde: direkt, konkret, leicht unperfekt in der Satzmelodie, mit echtem Bezug auf die genannten Fakten statt auf generische Eigenschaften.';

function buildPrompt(d) {
  const lines = [];
  lines.push('Position: ' + d.position);
  lines.push('Unternehmen: ' + d.unternehmen);
  if (d.ort) lines.push('Ort: ' + d.ort);
  if (d.quelle) lines.push('Quelle der Ausschreibung: ' + d.quelle);
  if (d.beruf) lines.push('Aktueller Beruf: ' + d.beruf);
  if (d.erfahrung.length) {
    lines.push('Berufserfahrung:');
    d.erfahrung.forEach(e => {
      lines.push('- ' + [e.role, e.company && ('bei ' + e.company), (e.from || e.to) && ((e.from || '') + '–' + (e.to || ''))].filter(Boolean).join(', ') + (e.desc ? ': ' + e.desc : ''));
    });
  }
  if (d.ausbildung.length) {
    lines.push('Ausbildung:');
    d.ausbildung.forEach(e => lines.push('- ' + [e.degree, e.school && ('an der ' + e.school)].filter(Boolean).join(' ')));
  }
  if (d.kenntnisse.length) lines.push('Kenntnisse: ' + d.kenntnisse.join(', '));
  if (d.soft.length) lines.push('Soft Skills: ' + d.soft.join(', '));
  if (d.sprachen.length) lines.push('Sprachen: ' + d.sprachen.map(l => l.name + (l.level ? ' (' + l.level + ')' : '')).join(', '));
  if (d.motivation) lines.push('Persönliche Motivation (vom Bewerber angegeben, verwende dies als Grundlage für den Motivationsabsatz): ' + d.motivation);
  return lines.join('\n');
}

function extractParagraphs(text) {
  let jsonStr = text.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonStr = fence[1].trim();
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && Array.isArray(parsed.paragraphs)) {
      return parsed.paragraphs.map(p => String(p).trim()).filter(Boolean).slice(0, 8);
    }
  } catch (ignore) {}
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).slice(0, 8);
}

function toArray(v) { return Array.isArray(v) ? v : []; }
function clip(v, max) { return typeof v === 'string' ? v.slice(0, max).trim() : ''; }
