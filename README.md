# Flow

![Flow, a focus app. Plan the day, run the timer, reflect on it.](portfolio/case/01-hero.png)

A focus app that runs in the browser. Plan the day, run the timer, reflect on how
it went.

### [Open the live demo](https://arihantslittlecave.github.io/flow-focus-app/)

No sign up, no account, no server. Everything stays in your own browser, in
`localStorage` under `flow.v2`, and exports as readable JSON whenever you want it.

A personal design project, not a product for sale. Two iterations: the first went
up in January 2026 as a set of designs, this one in August 2026 as working
software. The case study comparing them is in `portfolio/case/`.

Plain HTML, CSS and JavaScript. No framework, no dependencies, no build step, and
once the page has loaded it makes no network requests at all. The one typeface it
uses is in the repo.

## Run it

Open `app/index.html`. That is it.

`index.html` at the root is the same app built into one file by
`tools/build_app.py`, with the stylesheet, script, fonts and icons inlined. That
is what the live demo serves. Edit `app/`, never that file, and rerun the build.

Dictation on the Reflect screen needs a served page, so for that:

```bash
python tools/serve.py
```

## Tests

```bash
python tools/e2e.py
```

215 checks with real mouse events: every screen, every control, both themes,
colour contrast.

```bash
python tools/mobile_check.py
```

The same app driven the way a phone drives it, at four viewport sizes with real
touch events.

Both take a URL, so they can run against the built file or the live site instead
of the source:

```bash
FLOW_URL=https://arihantslittlecave.github.io/flow-focus-app/ python tools/e2e.py
```

## Licence

All rights reserved. The code is here to be read, not reused. If you want to use
part of it, ask me first.
