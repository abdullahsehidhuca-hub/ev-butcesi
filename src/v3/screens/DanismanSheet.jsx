// Yapay zekâ danışmanı (Rapor'dan açılır). Bu dönemin özeti (aiData.advisorPrompt) sunucuya gönderilir, yanıt düz
// metin satırları olarak gösterilir (HTML basılmaz); günlük hak sunucuda sayılır (functions/ai/advisor.js).
// Arayüzde neyin gönderildiği anlatılmaz (Abdullah, 2026-11-12); veri işleme gizlilik metninde yer alır.
// Oturum yoksa giriş çekmecesine yönlendirilir; örnek veri modunda (onLogin yok) kapalıdır.
import { useMemo, useState } from "react";
import { Sheet, ErrorText } from "../ui.jsx";
import { advisorPrompt, adviceBlocks } from "../aiData.js";
import { callAi } from "../ai.js";

const noDot = m => String(m || "").replace(/\.$/, "");

export default function DanismanSheet({ state, today, aiUser, onClose, onLogin }) {
  const prompt = useMemo(() => advisorPrompt(state, today), [state, today]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState(null); // { text, remaining }

  const ask = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const d = await callAi(aiUser, "aiAdvisor", { prompt });
      setAnswer({ text: d.text || "", remaining: d.remaining });
    } catch (e) {
      setError(noDot(e.message));
    }
    setBusy(false);
  };
  const blocks = answer ? adviceBlocks(answer.text) : [];

  return (
    <Sheet title="Yapay zekâ danışmanı" onClose={onClose}>
      {!answer && <>
        <p className="v3-sheet-text">Bu dönemi yorumlar: harcama hızınız, yaklaşan ödemeler, önümüzdeki aylar ve rakamlı öneriler. Günde 3 kez kullanılabilir.</p>
      </>}

      {busy && <p className="v3-sheet-text" role="status">Yorumlanıyor… Bu 1–2 dakika sürebilir; çekmeceyi kapatmayın.</p>}

      {answer && (
        <article aria-label="Danışmanın değerlendirmesi" className="stack" style={{ gap: 6 }}>
          {blocks.length ? blocks.map((b, i) => b.type === "h"
            ? <h4 key={i} className="t-body b" style={{ margin: "10px 0 2px" }}>{b.text}</h4>
            : <p key={i} className="t-sub" style={{ margin: 0, color: "var(--label)", paddingLeft: b.type === "li" ? 14 : 0, textIndent: b.type === "li" ? -10 : 0 }}>{b.type === "li" && !/^\d/.test(b.text) ? "• " : ""}{b.text}</p>)
            : <p className="v3-sheet-text">Danışman boş yanıt döndürdü. Biraz sonra yeniden deneyin.</p>}
          {typeof answer.remaining === "number" && <p className="t-meta" style={{ marginTop: 8 }}>Bugün {answer.remaining} hakkınız kaldı.</p>}
        </article>
      )}

      <ErrorText errors={error ? [error] : null} />
      {!aiUser && !answer && <p className="v3-hint">{onLogin
        ? "Yapay zekâ özellikleri aile hesabıyla çalışır; önce giriş yapın."
        : "Örnek veri modunda yapay zekâ kullanılmaz; gerçek verinize geçip giriş yapın."}</p>}

      <div className="v3-actions" style={{ marginTop: 14 }}>
        <button type="button" className="v3-cancel" onClick={onClose}>{answer ? "Kapat" : "Vazgeç"}</button>
        {!answer && aiUser && <button type="button" className="v3-submit" onClick={ask} disabled={busy}>{busy ? "Bekleyin…" : "Yorumlat"}</button>}
        {!answer && !aiUser && onLogin && <button type="button" className="v3-submit" onClick={onLogin}>Giriş yap</button>}
      </div>
    </Sheet>
  );
}
