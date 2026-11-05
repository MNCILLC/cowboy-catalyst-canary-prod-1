# HTML Block

Add **Content / HTML Block** in the Makeswift component tray, open its **HTML**
code editor, and enter or paste an HTML fragment. The block renders the markup
on the page and updates when the value changes. Use the standard style panels
for sizing, spacing, borders, and corners.

The renderer keeps the Makeswift class name and forwarded ref on its root div.
Markup is included in server rendering, and an empty HTML value renders an empty
wrapper. New blocks start with a short sample paragraph so they can be selected.

HTML is rendered as supplied, without sanitization or an iframe. This component
is for trusted content editors; do not feed it visitor-submitted content. Inline
styles and existing site classes work. Style tags can affect the surrounding
page, so scope CSS to your block. Pasted utility classes must already exist in
the compiled stylesheet. Paste a fragment rather than a complete HTML document.

This is an HTML renderer, not a script loader. It does not explicitly execute or
reinitialize scripts; use a dedicated integration for JavaScript-dependent embeds.

The installed Makeswift `Code` control supplies `{ value: string }`:
https://docs.makeswift.com/developer/docs/reference/controls/code
