// api/marktprijs.js — Vercel Serverless Function
//
// Haalt Google Shopping-prijzen op via SerpApi — SYNCHROON: één aanvraag,
// meteen een antwoord (geen taak starten + later ophalen zoals bij DataForSEO).
//
// Vereist de environment variable SERPAPI_KEY, ingesteld in Vercel
// (Project Settings > Environment Variables). Nooit in de broncode zetten —
// dit bestand draait enkel op de server, dus process.env is hier veilig.

module.exports = async function handler(req, res) {
  const query = (req.query.query || "").trim();
  const expectedPrice = parseFloat(req.query.expected_price);
  const hasExpectedPrice = !isNaN(expectedPrice) && expectedPrice > 0;

  if (!query) {
    return res.status(400).json({ error: "Parameter 'query' (artikelnaam) ontbreekt." });
  }

  // Kern-woorden uit de artikelnaam (het merk + het specifieke model/product,
  // bv. "goki honolulu puzzel") — deze moeten ALLEMAAL terugkomen in de titel
  // van een match. Woorden tussen haakjes (kleur/afwerking, bv. "(rood)") tellen
  // NIET mee, want winkels benoemen kleuren niet altijd op dezelfde manier —
  // maar een modelnaam als "Honolulu" verandert nooit van winkel tot winkel,
  // dus die moet wél letterlijk terugkomen.
  const queryLower = query.toLowerCase();
  const coreQueryText = queryLower.replace(/\([^)]*\)/g, " ").trim();
  const coreWords = coreQueryText.split(/\s+/).filter((w) => w.length > 2);

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "SERPAPI_KEY ontbreekt op de server (environment variable is niet ingesteld in Vercel).",
    });
  }

  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    gl: "nl", // land: Nederland
    hl: "nl", // taal: Nederlands
    google_domain: "google.nl",
    api_key: apiKey,
  });

  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    const data = await response.json();

    if (data.error) {
      return res.status(200).json({ error: "SerpApi-fout: " + data.error });
    }

    const results = data.shopping_results || [];

    const rawEntries = results
      .map((r) => {
        const price = typeof r.extracted_price === "number" ? r.extracted_price : null;
        if (!price || price <= 0) return null;
        return {
          price,
          url: r.product_link || r.link || null,
          domain: r.source || null,
          title: (r.title || "").toLowerCase(),
        };
      })
      .filter((e) => e !== null);

    // Filter 1 — kern-woorden: ALLE woorden uit de artikelnaam (behalve wat
    // tussen haakjes staat) moeten terugkomen in de titel. Vangt zowel "ander
    // merk" (bv. generieke bowlingset) als "ander model van hetzelfde merk"
    // (bv. een andere Goki-puzzel dan "Honolulu") in één keer op.
    const titleFiltered = coreWords.length > 0
      ? rawEntries.filter((e) => coreWords.every((w) => e.title.includes(w)))
      : rawEntries;

    // Filter 2 — prijs-plausibiliteit: als we de eigen winkelprijs kennen, negeer
    // resultaten die extreem afwijken (buiten 40%-250% van die prijs) — meestal
    // een teken dat het om een ander product gaat, niet om een echt prijsverschil.
    const priceFiltered = hasExpectedPrice
      ? titleFiltered.filter((e) => e.price >= expectedPrice * 0.4 && e.price <= expectedPrice * 2.5)
      : titleFiltered;

    const priceEntries = priceFiltered.slice(0, 10);
    const aantalGefilterd = rawEntries.length - priceEntries.length;

    const prices = priceEntries.map((e) => e.price);
    const gemiddelde =
      prices.length > 0 ? (prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2) : null;

    return res.status(200).json({
      gevondenPrijzen: priceEntries,
      aantalGevonden: priceEntries.length,
      aantalGefilterd: aantalGefilterd > 0 ? aantalGefilterd : 0,
      gemiddelde,
    });
  } catch (err) {
    return res.status(500).json({ error: "Serverfout bij ophalen: " + err.message });
  }
};
