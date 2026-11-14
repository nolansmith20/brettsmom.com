# brettsmom.com

An affectionate, PG parody site for booking time with Brett's Mom. Deadpan on purpose. Nothing here is affiliated with any actual mom, and nothing you type is sent anywhere.

The site is plain HTML, CSS, and JavaScript. There is no build step.

## GitHub Pages

Pages should be served from the root of `main`, which is where `index.html` and `CNAME` live.

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set the branch to **main** and the folder to **`/ (root)`**, then save.
4. `CNAME` already contains `brettsmom.com`. At the DNS host, point the domain at GitHub Pages the way GitHub describes (A records for the apex, and a `CNAME` or `ALIAS` for `www` if you use it).
5. After DNS settles, the site is at [https://brettsmom.com](https://brettsmom.com).

`.nojekyll` is included so Pages serves the files as-is.

## Booking

The scheduler runs entirely in the browser. A confirmation can download a real `.ics` calendar file. The last visit (name, service, time, reference) is remembered in `localStorage`. Email addresses are not stored and are not transmitted.

## Local preview

From this folder:

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765`. Modules do not load from a `file://` URL.

Optional checks for the calendar rules and `.ics` output:

```bash
npm test
```
