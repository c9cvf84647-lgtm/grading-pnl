"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Card = {
  id: string;
  pcId: string;
  name: string;
  number: string;
  set: string;
  image: string;
  cost: number;
  grading: number;
  company: string;
  grade: string;
  market: number;
  priceLabel: string;
  priceUpdatedAt: number;
  exit: number | null;
  createdAt: number;
};

type Hit = { id: string; name: string; number: string; set: string; image: string };

type Form = {
  pcId: string;
  name: string;
  number: string;
  set: string;
  image: string;
  cost: string;
  grading: string;
  company: string;
  grade: string;
  market: string;
  priceLabel: string;
  priceUpdatedAt: number;
  exit: string;
};

const COMPANIES = ["PSA", "BGS", "CGC", "SGC", "TAG", "ACE", "Other"];
const GRADES = [
  ...Array.from({ length: 19 }, (_, i) => String(10 - i * 0.5)),
  "Black Label 10",
  "Pristine 10",
  "Authentic",
];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmt = (n: number) => usd.format(n || 0);
const signed = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + usd.format(Math.abs(n || 0));
const num = (v: string | number | null | undefined) => {
  const n = parseFloat(String(v ?? ""));
  return isFinite(n) ? n : 0;
};
const tone = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const valueOf = (c: { market: number; exit: number | null }) => (c.exit !== null ? c.exit : c.market);
const pnlOf = (c: Card) => valueOf(c) - c.cost - c.grading;

const emptyForm = (): Form => ({
  pcId: "", name: "", number: "", set: "", image: "", cost: "", grading: "", company: "PSA", grade: "",
  market: "", priceLabel: "", priceUpdatedAt: 0, exit: "",
});

const toForm = (c: Card): Form => ({
  pcId: c.pcId, name: c.name, number: c.number, set: c.set, image: c.image, cost: String(c.cost || ""),
  grading: String(c.grading || ""), company: c.company, grade: c.grade, market: String(c.market || ""),
  priceLabel: c.priceLabel, priceUpdatedAt: c.priceUpdatedAt, exit: c.exit === null ? "" : String(c.exit),
});

function priceLinks(c: { name: string; number: string; company: string; grade: string }) {
  const base = [c.name, c.number].filter(Boolean).join(" ").trim();
  if (!base) return [];
  const graded = c.grade ? [base, c.company, c.grade].filter(Boolean).join(" ") : base;
  const q = encodeURIComponent;
  return [
    ["TCGplayer", "https://www.tcgplayer.com/search/pokemon/product?q=" + q(base)],
    ["PriceCharting", "https://www.pricecharting.com/search-products?type=prices&q=" + q(base)],
    ["eBay sold", "https://www.ebay.com/sch/i.html?_nkw=" + q(graded) + "&LH_Sold=1&LH_Complete=1"],
    ["130point", "https://130point.com/sales/?q=" + q(graded)],
  ] as const;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data as T;
}

export function Masthead({ children }: { children?: React.ReactNode }) {
  return (
    <div className="band">
      <header className="inner">
        <div>
          <h1>Grading <span>PnL</span></h1>
          <p className="sub">Every card you&apos;ve sent for grading, and what it&apos;s worth now.</p>
        </div>
        <div className="headright">{children}</div>
      </header>
    </div>
  );
}

export default function Tracker({ premium, account }: { premium: boolean; account: React.ReactNode }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toolbarMsg, setToolbarMsg] = useState("");

  useEffect(() => {
    api<{ cards: Card[] }>("/api/cards")
      .then((d) => setCards(d.cards))
      .catch((e) => setLoadError(e.message));
  }, []);

  const totals = useMemo(() => {
    const list = cards || [];
    let cost = 0, grading = 0, value = 0, realized = 0, unrealized = 0, graded = 0, sold = 0;
    for (const c of list) {
      cost += c.cost;
      grading += c.grading;
      value += valueOf(c);
      if (c.grading > 0) graded++;
      if (c.exit !== null) { realized += pnlOf(c); sold++; } else unrealized += pnlOf(c);
    }
    const pnl = value - cost - grading;
    return { count: list.length, cost, grading, value, pnl, allIn: cost + grading, realized, unrealized, graded, sold };
  }, [cards]);

  function openEditor(c: Card | null) {
    setEditingId(c ? c.id : null);
    setForm(c ? toForm(c) : emptyForm());
    setConfirmingId(null);
  }

  async function onSaved(card: Card) {
    setCards((prev) => {
      const list = prev || [];
      return list.some((c) => c.id === card.id) ? list.map((c) => (c.id === card.id ? card : c)) : [...list, card];
    });
    setForm(null);
    setEditingId(null);
  }

  async function remove(c: Card) {
    try {
      await api("/api/cards/" + c.id, { method: "DELETE" });
      setCards((prev) => (prev || []).filter((x) => x.id !== c.id));
    } catch (e) {
      setToolbarMsg((e as Error).message);
    }
    setConfirmingId(null);
  }

  async function refreshAll() {
    setRefreshing(true);
    setToolbarMsg("");
    try {
      const d = await api<{ cards: Card[] }>("/api/cards/refresh", { method: "POST" });
      setCards(d.cards);
      setToolbarMsg("Market prices updated.");
    } catch (e) {
      setToolbarMsg((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const exitCols = premium;

  return (
    <>
      <Masthead>
        {account}
        <div className="headpnl">
          <span className="k">Overall PnL</span>
          <span className={"v " + tone(totals.pnl)}>{signed(totals.pnl)}</span>
        </div>
        <button className="primary" type="button" onClick={() => openEditor(null)} disabled={!cards}>
          Add card
        </button>
      </Masthead>

      <main className="inner">
        {form && (
          <Editor
            key={editingId || "new"}
            initial={form}
            editingId={editingId}
            premium={premium}
            onCancel={() => setForm(null)}
            onSaved={onSaved}
          />
        )}

        {cards && cards.length > 0 && (
          <div className="toolbar">
            <span className="status" role="status">{toolbarMsg}</span>
            <button type="button" onClick={refreshAll} disabled={refreshing}>
              {refreshing ? "Updating prices…" : "Update market prices"}
            </button>
          </div>
        )}

        <div className="table-box">
          <table>
            <thead>
              <tr>
                <th>Card</th>
                <th>Name &amp; number</th>
                <th className="num">Price in</th>
                <th className="num">Grading</th>
                <th>Company</th>
                <th>Grade</th>
                <th className="num">Market</th>
                {exitCols && <th className="num">Exit</th>}
                <th className="num">PnL</th>
                <th><span hidden>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {(cards || []).map((c) => {
                const p = pnlOf(c);
                return (
                  <tr key={c.id}>
                    <td>
                      {c.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="thumb" src={c.image} alt={c.name} loading="lazy" />
                      ) : (
                        <div className="thumb blank">No photo</div>
                      )}
                    </td>
                    <td>
                      <div className="cname">{c.name}</div>
                      <div className="cnum">{[c.number ? "#" + c.number : "", c.set].filter(Boolean).join(" · ")}</div>
                      <div className="mini">
                        {priceLinks(c).map(([label, href]) => (
                          <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}</a>
                        ))}
                      </div>
                    </td>
                    <td className="num">{fmt(c.cost)}</td>
                    <td className="num">{fmt(c.grading)}</td>
                    <td className="grader">{c.company || "–"}</td>
                    <td>
                      {c.grade ? <span className="grade">{c.grade}</span> : <span className="grade pending">Pending</span>}
                    </td>
                    <td className="num">
                      {fmt(c.market)}
                      {c.priceLabel && <span className="src">{c.priceLabel}</span>}
                    </td>
                    {exitCols && (
                      <td className="num">
                        {c.exit !== null ? <>{fmt(c.exit)}<span className="sold">Sold</span></> : "–"}
                      </td>
                    )}
                    <td className="num">
                      <span className={"pnl-chip " + tone(p)}>{signed(p)}</span>
                    </td>
                    <td>
                      <div className="rowbtns">
                        {confirmingId === c.id ? (
                          <>
                            <button type="button" className="danger" onClick={() => remove(c)}>Delete</button>
                            <button type="button" onClick={() => setConfirmingId(null)}>Keep</button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => openEditor(c)}>Edit</button>
                            <button type="button" className="danger" aria-label={"Delete " + c.name} onClick={() => setConfirmingId(c.id)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(!cards || cards.length === 0) && (
            <div className="empty">
              <strong>{loadError ? "Couldn't load your cards" : cards ? "No cards yet" : "Loading your cards…"}</strong>
              <span>
                {loadError ||
                  "Tap Add card and start typing the card name. Pick it from the list and the photo and market price fill in on their own."}
              </span>
            </div>
          )}
        </div>

        <section className="summary" aria-labelledby="sumTitle">
          <h2 id="sumTitle">Portfolio PnL</h2>
          <div className="sumgrid">
            <div className="tile hero">
              <span className="k">Overall PnL</span>
              <span className={"v " + tone(totals.pnl)}>{signed(totals.pnl)}</span>
              <span className="d">Market value − price in − grading{premium ? " (sale price for sold cards)" : ""}</span>
            </div>
            <div className="tile">
              <span className="k">Gross profit</span>
              <span className="v">{fmt(totals.value)}</span>
              <span className="d">Sum of graded market values</span>
            </div>
            <div className="tile">
              <span className="k">Total grading costs</span>
              <span className="v">{fmt(totals.grading)}</span>
              <span className="d">Across {totals.graded} {totals.graded === 1 ? "card" : "cards"}</span>
            </div>
          </div>
          <div className="breakdown">
            <div><span className="k">Cards</span><span className="v">{totals.count}</span></div>
            <div><span className="k">Total price in</span><span className="v">{fmt(totals.cost)}</span></div>
            <div><span className="k">All-in cost</span><span className="v">{fmt(totals.allIn)}</span></div>
            <div>
              <span className="k">Average PnL per card</span>
              <span className={"v " + (totals.count ? tone(totals.pnl) : "")}>{totals.count ? signed(totals.pnl / totals.count) : "–"}</span>
            </div>
            <div>
              <span className="k">Return on all-in</span>
              <span className={"v " + (totals.allIn > 0 ? tone(totals.pnl) : "")}>
                {totals.allIn > 0 ? (totals.pnl >= 0 ? "+" : "−") + Math.abs((totals.pnl / totals.allIn) * 100).toFixed(1) + "%" : "–"}
              </span>
            </div>
            {premium && (
              <>
                <div><span className="k">Realized PnL ({totals.sold} sold)</span><span className={"v " + tone(totals.realized)}>{signed(totals.realized)}</span></div>
                <div><span className="k">Unrealized PnL</span><span className={"v " + tone(totals.unrealized)}>{signed(totals.unrealized)}</span></div>
              </>
            )}
          </div>
          {!premium && (
            <div className="upsell">
              <span className="badge">Premium</span>
              <span>Track what you sold each card for with the Exit column, and see realized vs unrealized PnL.</span>
            </div>
          )}
          <p className="note">
            Market prices and card photos come from PriceCharting and match each card&apos;s grading company and grade. The
            links under each card open TCGplayer, PriceCharting, eBay sold listings and 130point to double-check.
          </p>
        </section>
      </main>
    </>
  );
}

function Editor({
  initial, editingId, premium, onCancel, onSaved,
}: {
  initial: Form;
  editingId: string | null;
  premium: boolean;
  onCancel: () => void;
  onSaved: (c: Card) => void;
}) {
  const [f, setF] = useState<Form>(initial);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [lookup, setLookup] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const searchSeq = useRef(0);
  const priceSeq = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    formRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));

  // Type-ahead: waits for a short pause in typing, then asks the server
  function onNameInput(value: string) {
    set({ name: value, pcId: "", image: "", priceLabel: "" });
    const q = value.trim();
    const seq = ++searchSeq.current;
    if (q.length < 2) { setHits(null); return; }
    setSearching(true);
    setTimeout(async () => {
      if (seq !== searchSeq.current) return;
      try {
        const d = await api<{ results: Hit[] }>("/api/search?q=" + encodeURIComponent(q));
        if (seq === searchSeq.current) { setHits(d.results); setActive(-1); }
      } catch (e) {
        if (seq === searchSeq.current) { setHits([]); setLookup((e as Error).message); }
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 250);
  }

  async function lookupPrice(pcId: string, company: string, grade: string) {
    if (!pcId) return;
    const seq = ++priceSeq.current;
    setLookup("Looking up market price…");
    try {
      const d = await api<{ product: { image: string; set: string }; label: string; price: number | null }>(
        `/api/price?id=${pcId}&company=${encodeURIComponent(company)}&grade=${encodeURIComponent(grade)}`,
      );
      if (seq !== priceSeq.current) return;
      setF((prev) => ({
        ...prev,
        image: prev.image || d.product.image,
        market: d.price === null ? prev.market : String(d.price),
        priceLabel: d.price === null ? "" : d.label,
        priceUpdatedAt: d.price === null ? prev.priceUpdatedAt : Date.now(),
      }));
      setLookup(d.price === null ? `No ${d.label} sales on record yet. Enter the market price yourself.` : `Market price: ${d.label} on PriceCharting.`);
    } catch (e) {
      if (seq === priceSeq.current) setLookup((e as Error).message);
    }
  }

  function pick(h: Hit) {
    searchSeq.current++;
    setHits(null);
    setSearching(false);
    setF((prev) => ({ ...prev, pcId: h.id, name: h.name, number: h.number, set: h.set, image: h.image }));
    lookupPrice(h.id, f.company, f.grade);
  }

  function onGradeChange(patch: Partial<Form>) {
    const next = { ...f, ...patch };
    set(patch);
    lookupPrice(next.pcId, next.company, next.grade);
  }

  function onKeyDown(ev: React.KeyboardEvent) {
    if (!hits || !hits.length) return;
    if (ev.key === "ArrowDown") { ev.preventDefault(); setActive((a) => (a + 1) % hits.length); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
    else if (ev.key === "Enter" && active >= 0) { ev.preventDefault(); pick(hits[active]); }
    else if (ev.key === "Escape") setHits(null);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!f.name.trim()) { setError("Add the card's name before saving."); nameRef.current?.focus(); return; }
    setSaving(true);
    setError("");
    const payload = {
      ...f,
      cost: num(f.cost),
      grading: num(f.grading),
      market: num(f.market),
      exit: f.exit.trim() === "" ? null : num(f.exit),
    };
    try {
      const d = await api<{ card: Card }>(editingId ? "/api/cards/" + editingId : "/api/cards", {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      onSaved(d.card);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const value = f.exit.trim() !== "" && premium ? num(f.exit) : num(f.market);
  const preview = value - num(f.cost) - num(f.grading);
  const links = priceLinks(f);

  return (
    <form className="editor" ref={formRef} onSubmit={submit} noValidate>
      <h2>{editingId ? "Edit card" : "Add card"}</h2>
      <div className="fields">
        <div className={"photo" + (f.image ? " has" : "")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {f.image ? <img src={f.image} alt={f.name} /> : <span>Pick a card from the list to add its photo</span>}
        </div>
        <div className="grid">
          <div className="full" style={{ display: "grid", gap: 4 }}>
            <label htmlFor="fName">Card name</label>
            <div className="ac">
              <input
                id="fName"
                ref={nameRef}
                value={f.name}
                placeholder="Start typing, like charizard 69 or pikachu japanese promo"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={Boolean(hits)}
                aria-controls="acList"
                aria-activedescendant={active >= 0 ? "ac" + active : undefined}
                onChange={(e) => onNameInput(e.target.value)}
                onKeyDown={onKeyDown}
                onBlur={() => setTimeout(() => setHits(null), 150)}
              />
              {hits && (
                <ul className="ac-list" id="acList" role="listbox">
                  {hits.length === 0 && (
                    <li className="none">{searching ? "Searching…" : "No matching card. Keep typing to enter it yourself."}</li>
                  )}
                  {hits.map((h, i) => (
                    <li
                      key={h.id}
                      id={"ac" + i}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => { e.preventDefault(); pick(h); }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {h.image ? <img src={h.image} alt="" /> : <span />}
                      <span>
                        <span className="t">{h.name}</span>
                        <span className="m">{h.number && <b>#{h.number}</b>}{h.number ? " · " : ""}{h.set}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <label>Card number<input value={f.number} onChange={(e) => set({ number: e.target.value })} placeholder="199/165" /></label>
          <label>Set<input value={f.set} onChange={(e) => set({ set: e.target.value })} placeholder="Scarlet & Violet 151" /></label>
          <label>Price I&apos;m in for ($)<input type="number" step="0.01" min="0" inputMode="decimal" value={f.cost} onChange={(e) => set({ cost: e.target.value })} /></label>
          <label>Grading cost ($)<input type="number" step="0.01" min="0" inputMode="decimal" value={f.grading} onChange={(e) => set({ grading: e.target.value })} /></label>
          <label>Grading company
            <select value={f.company} onChange={(e) => onGradeChange({ company: e.target.value })}>
              {COMPANIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Grade
            <select value={f.grade} onChange={(e) => onGradeChange({ grade: e.target.value })}>
              <option value="">Pending</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label>Market price ($)<input type="number" step="0.01" min="0" inputMode="decimal" value={f.market} onChange={(e) => set({ market: e.target.value, priceLabel: "" })} /></label>
          <label>
            <span>Exit ($) {!premium && <span className="lock">· Premium</span>}</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal" value={f.exit} disabled={!premium}
              placeholder={premium ? "Sold for" : "Premium feature"}
              onChange={(e) => set({ exit: e.target.value })}
            />
          </label>
          {(lookup || links.length > 0) && (
            <div className="full" style={{ display: "grid", gap: 6 }}>
              {lookup && <span className="status" role="status">{lookup}</span>}
              {links.length > 0 && (
                <div className="links">
                  <span className="lbl">Double-check:</span>
                  {links.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}</a>)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="actions">
        <button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save card"}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <span className="msg" role="alert">{error}</span>
        <span className="preview">PnL: <b className={tone(preview)}>{signed(preview)}</b></span>
      </div>
    </form>
  );
}
