// api/marktprijs-result.js — Vercel Serverless Function
//
// Haalt het resultaat op van een taak die eerder gestart werd via marktprijs-start.js.
// DataForSEO heeft meestal een paar seconden nodig om een taak te verwerken — als het
// nog niet klaar is, geven we { ready: false } terug, en de app in de browser probeert
// dan gewoon straks opnieuw (polling), in plaats van dat deze functie blijft wachten.

module.exports = async function handler(req, res) {
  const taskId = req.query.task_id;
  if (!taskId) {
    return res.status(400).json({ error: "Parameter 'task_id' ontbreekt." });
  }

  // Optioneel: eigen winkelprijs, gebruikt om duidelijke mismatches (bv. een
  // heel ander product dat er toevallig op lijkt) te filteren op prijs.
  const expectedPrice = parseFloat(req.query.expected_price);
  const hasExpectedPrice = !isNaN(expectedPrice) && expectedPrice > 0;

  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    return res.status(500).json({
      error: "DataForSEO-inloggegevens ontbreken op de server (environment variables).",
    });
  }

  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  try {
    const response = await fetch(
      `https://api.dataforseo.com/v3/merchant/google/products/task_get/advanced/${taskId}`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    const data = await response.json();
    const task = data.tasks && data.tasks[0];

    if (!task) {
      return res.status(200).json({ ready: false });
    }

    const result = task.result && task.result[0];
    const items = (result && result.items) || [];

    if (!result || items.length === 0) {
      // Kan betekenen: nog niet klaar, OF echt geen resultaten gevonden.
      // We geven het nog even de kans om te "rijpen" door ready:false terug te geven
      // zolang de taak zelf nog geen duidelijke eindstatus heeft.
      return res.status(200).json({
        ready: task.status_code !== 20000 ? false : true,
        aantalGevonden: 0,
        gevondenPrijzen: [],
        gemiddelde: null,
        debug_status: task.status_code,
        debug_message: task.status_message,
      });
    }

    // DataForSEO product-items geven prijs meestal als een object terug
    // (bv. { current, regular, ... }) — we proberen de meest voorkomende vormen.
    const rawEntries = items
      .map((it) => {
        let price = null;
        if (it.price && typeof it.price === "object") {
          price = it.price.current ?? it.price.value ?? it.price.regular ?? null;
        } else if (typeof it.price === "number") {
          price = it.price;
        }
        if (typeof price !== "number" || price <= 0) return null;
        return {
          price,
          url: it.url || null,
          domain: it.domain || it.seller || null,
          title: (it.title || "").toLowerCase(),
        };
      })
      .filter((entry) => entry !== null);

    // Filter — enkel op prijs-plausibiliteit (geen tekst/titel-check meer: die
    // bleek te streng en verwierp ook correcte matches met een net iets andere
    // omschrijving). Als we de eigen winkelprijs kennen, negeer resultaten die
    // extreem afwijken (buiten 40%-250% van die prijs) — meestal een teken dat
    // het om een ander product gaat, niet om een echt prijsverschil.
    const priceFiltered = hasExpectedPrice
      ? rawEntries.filter((e) => e.price >= expectedPrice * 0.4 && e.price <= expectedPrice * 2.5)
      : rawEntries;

    const priceEntries = priceFiltered.slice(0, 10);
    const aantalGefilterd = rawEntries.length - priceEntries.length;

    const prices = priceEntries.map((e) => e.price);
    const gemiddelde =
      prices.length > 0 ? (prices.reduce((s, p) => s + p, 0) / prices.length).toFixed(2) : null;

    return res.status(200).json({
      ready: true,
      gevondenPrijzen: priceEntries,
      aantalGevonden: priceEntries.length,
      aantalGefilterd: aantalGefilterd > 0 ? aantalGefilterd : 0,
      gemiddelde,
      debug_raw_first_item: priceEntries.length === 0 ? items[0] : undefined,
    });
  } catch (err) {
    return res.status(500).json({ error: "Serverfout bij ophalen van resultaat: " + err.message });
  }
};
