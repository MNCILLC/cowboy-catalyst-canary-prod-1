import { Stream, Streamable } from '@/vibes/soul/lib/streamable';
import { Accordion, AccordionItem } from '@/vibes/soul/primitives/accordion';
import { ShowCrateFeatures } from '@/vibes/soul/primitives/show-crate-product-card/show-crate-features';

interface Props {
  title: string;
  specifications: Streamable<Array<{ name: string; value: string }>>;
}

export function ShowProductSpecifications({ title, specifications }: Props) {
  return (
    <Accordion
      className="border-t border-[var(--product-detail-border,hsl(var(--contrast-100)))] pt-4"
      defaultValue={['specifications']}
      type="multiple"
    >
      <AccordionItem title={title} value="specifications">
        <Stream fallback={null} value={specifications}>
          {(fields) => (
            <ShowCrateFeatures
              features={fields
                .filter((field) => field.value.trim() !== '')
                .map((field, index) => ({
                  id: index.toString(),
                  value: `${field.name}: ${field.value}`,
                }))}
            />
          )}
        </Stream>
      </AccordionItem>
    </Accordion>
  );
}
