import { Stream, Streamable } from '@/vibes/soul/lib/streamable';
import { Accordion, AccordionItem } from '@/vibes/soul/primitives/accordion';
import {
  ShowCrateFeatures,
  type ShowCrateFeaturesTextSize,
} from '@/vibes/soul/primitives/show-crate-product-card/show-crate-features';

interface Props {
  title: string;
  specifications: Streamable<Array<{ id: string; value: string }>>;
  textSize?: ShowCrateFeaturesTextSize;
}

export function ShowProductSpecifications({ title, specifications, textSize = 'base' }: Props) {
  return (
    <Accordion className="" defaultValue={['specifications']} type="multiple">
      <AccordionItem title={title} value="specifications">
        <Stream fallback={null} value={specifications}>
          {(fields) => <ShowCrateFeatures features={fields} textSize={textSize} />}
        </Stream>
      </AccordionItem>
    </Accordion>
  );
}
