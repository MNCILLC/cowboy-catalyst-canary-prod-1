# Hero Video

In Makeswift, add **Sections → Hero Video** to the landing page. The component
extends to the viewport edges, including when placed inside a padded content box.

## Background

1. Upload an MP4 to **Makeswift Files** and copy its file URL.
2. Paste the URL into **Video URL**. A publicly accessible HTTPS video file URL
   also works; YouTube and Vimeo page URLs are not supported.
3. Leave **Aspect ratio** blank to use the video's native dimensions. To crop the
   video to another ratio, enter `16:9`, `21/9`, `4:3`, or a decimal such as `1.5`.
4. Choose **Overlay color** and **Overlay opacity** (0–100%). The defaults are
   black and 40%.

The video is muted, loops, and stays mounted when text slides change. The section
uses 16:9 until video metadata is available. Invalid ratio values fall back to the
native ratio. A missing or failed video leaves a black background under the
overlay, with slide content still available.

Uploads use Makeswift's Files library, the agreed media workflow for this
component. This component does not upload files to BigCommerce Image Manager.
The installed Makeswift runtime has no public video-upload control for custom
components, so upload in Files and paste the resulting URL into the setting.

## Slides

Add and reorder items under **Slides**. Each slide includes:

- Title, subtitle, and description accepting plain text or HTML.
- Horizontal alignment: left, center, or right.
- Vertical alignment: top, center, or bottom.
- **Show button** and button text accepting plain text or inline HTML.
- Button color: Primary, Secondary, Tertiary, or Ghost.
- Optional **Button hex color override**, accepting `#RGB` or `#RRGGBB`. This
  overrides the variant's background and border and chooses black or white text
  for contrast. Clear it to restore the theme colors.
- Makeswift's native **Button link** control: Open page, Open URL, Compose email,
  Call phone, or Scroll to element. Page and URL links include the native
  **Open in a new tab** checkbox.

HTML supports common text formatting, paragraphs, headings, lists, and links.
Scripts, event handlers, and embedded media are removed. Button HTML is limited
to inline formatting to avoid nested interactive elements.

**Autoplay** controls text slides; **Duration** sets the seconds per slide
(default 5, minimum 1). The video's playback is independent of slide autoplay.
Visitors can select slides, pause slides, and pause the background video.
Hover temporarily pauses slide rotation; focusing slide content or manually
selecting a slide stops rotation until the visitor presses Play. Reduced-motion
preferences disable automatic motion, with manual Play still available.

The aspect ratio remains exact on small screens. If a slide's text is taller
than its available space, its content scrolls within the slide while the
navigation remains available. Use concise text or a taller aspect ratio for
mobile layouts.
