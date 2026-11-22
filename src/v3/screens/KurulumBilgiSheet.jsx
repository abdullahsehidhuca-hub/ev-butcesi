// İlk kurulumdaki bilgi penceresi: adımda girilen bilginin ne olduğunu ve uygulamada nasıl izleneceğini anlatır.
// next verilirse (boş adıma ilk dokunuş) "Ekle" düğmesi ekleme çekmecesine geçer; verilmezse yalnız "Tamam" vardır.
import { Sheet, Actions, Form } from "../ui.jsx";
import { STEP_INFO, LATER_NOTE } from "../setupGuide.js";

export default function KurulumBilgiSheet({ topic, onClose, onNext }) {
  const info = STEP_INFO[topic];
  if (!info) return null;
  return (
    <Sheet title={info.title} onClose={onClose}>
      {info.body.map(p => <p key={p} className="v3-sheet-text">{p}</p>)}
      {info.types && (
        <dl className="setup-types">
          {info.types.map(t => (
            <div key={t.value}>
              <dt className="t-sub b">{t.label}</dt>
              <dd className="t-meta">{t.info}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="v3-hint" style={{ margin: "0 4px 14px" }}>{LATER_NOTE}</p>
      <Form onSubmit={onNext || onClose}>
        {onNext ? <Actions submit="Ekle" onCancel={onClose} /> : (
          <div className="v3-actions"><button type="submit" className="v3-submit" style={{ flex: 1 }}>Tamam</button></div>
        )}
      </Form>
    </Sheet>
  );
}
