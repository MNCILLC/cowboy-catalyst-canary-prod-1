# Text styling

The existing Makeswift **Text** component now includes native **Border** and
**Corners** (border radius) panels. These controls support responsive values,
border color/style/width, individual sides, and individual corner radii.

The **Background color** picker sets the text block's background, including
color opacity. Leaving it unset preserves the existing transparent background.
The background follows the configured corner radii.

The override keeps the built-in component type and original ID, rich text, width,
and margin controls, including saved data formats and presets. Existing text
blocks gain the controls without needing to be replaced. Unset border settings
leave their current appearance unchanged.

Registration reads the original controls from the installed runtime's `protoStore`
before replacing the built-in registration. The renderer preserves the built-in
root div and resolved rich-text content. When upgrading Makeswift, verify this
registry API and the built-in Text markup remain compatible.
