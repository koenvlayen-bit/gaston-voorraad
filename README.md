# Gaston · Voorraadbeheer

Voorraadbeheer-tool voor gastonshop.be. Data wordt gedeeld tussen alle toestellen via Supabase; hosting gebeurt via Vercel.

## Wat is er anders dan de vorige Netlify-versie?

* **Gedeelde database (Supabase)** in plaats van lokale opslag per toestel. Jij en je collega zien nu dezelfde voorraad, live bijgewerkt.
* **Wachtwoordscherm** — één gedeeld wachtwoord, geen apart account per persoon.
* **Marktprijs-testfunctie** draait nu als Vercel-functie (`/api/marktprijs`) in plaats van een Netlify-functie.

## Deployen op Vercel

1. Installeer de Vercel CLI (eenmalig, vereist Node.js):

```
   npm install -g vercel
   ```

2. Ga in je terminal naar deze map (`vercel-site`).
3. Deploy met:

```
   vercel --prod
   ```

   De eerste keer vraagt dit om in te loggen (browservenster opent) en een paar standaardvragen te bevestigen — overal Enter voor de standaardwaarde is oké.

4. Je krijgt een live URL. Vercel herkent automatisch de map `api/` als serverless functies — geen extra configuratie nodig.

## Belangrijk om te weten

* **Wachtwoord:** staat momenteel in de broncode van de pagina (client-side check). Dit weert toevallige bezoekers, maar is geen echte beveiliging tegen iemand die gericht zou zoeken. Voldoende voor het afgesproken gebruik (2 vertrouwde personen).
* **Supabase-tabellen staan open voor lezen/schrijven zonder login** (bewust, om het "één gedeelde toegang, geen accounts"-principe te ondersteunen). De publieke API-sleutel in de broncode is daarvoor bedoeld om zichtbaar te zijn — de tabellen zelf zijn niet extra beveiligd met een wachtwoord op databaseniveau.
* **Marktprijs-tab blijft experimenteel:** geen officiële API, kan geblokkeerd worden door Google, en matcht nog zonder EAN-code (dat volgt later).

## Bestanden

* `index.html` — de volledige applicatie.
* `api/marktprijs.js` — de experimentele serverfunctie voor prijsvergelijking.
* `vercel.json` — minimale configuratie.
* test

