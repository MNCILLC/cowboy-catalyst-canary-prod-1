import { Color, Style } from '@makeswift/runtime/controls';
import { MakeswiftComponentType } from '@makeswift/runtime/react/builtins';
import { registerTextComponent } from '@makeswift/runtime/react/builtins/text';
import { ReactRuntimeCore } from '@makeswift/runtime/react/core';

import { MSText } from './client';

export function registerTextWithBorder(runtime: ReactRuntimeCore) {
  const unregister = registerTextComponent(runtime);
  // Keep the installed runtime's original controls and presets, including their
  // legacy data formats, so existing Text instances need no content migration.
  const props = runtime.protoStore.getState().propControllers.get(MakeswiftComponentType.Text);

  if (!props) throw new Error('Makeswift Text controls were not registered.');

  unregister();

  return runtime.registerComponent(MSText, {
    type: MakeswiftComponentType.Text,
    label: 'Text',
    icon: 'text',
    props: {
      ...props,
      backgroundColor: Color({ label: 'Background color' }),
      borderStyle: Style({ properties: [Style.Border, Style.BorderRadius] }),
    },
  });
}
