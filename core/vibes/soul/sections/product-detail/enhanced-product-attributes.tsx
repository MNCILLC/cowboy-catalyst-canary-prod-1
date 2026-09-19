interface Props {
  title: string;
  attributes: Array<{
    name: string;
    value: string;
    colors?: Array<{ value: string; label: string; swatchColor?: string }>;
  }>;
}

export function EnhancedProductAttributes({ title, attributes }: Props) {
  if (attributes.length === 0) return null;

  return (
    <section aria-label={title} className="@container">
      <div className="mx-auto w-full max-w-screen-2xl px-4 pb-10 @xl:px-6 @xl:pb-14 @4xl:px-8">
        <h2 className="mb-6 font-[family-name:var(--product-detail-title-font-family,var(--font-family-heading))] text-2xl font-medium text-[var(--product-detail-primary-text,hsl(var(--foreground)))] @xl:text-3xl @4xl:text-4xl">
          {title}
        </h2>
        <dl className="grid grid-cols-1 gap-px overflow-hidden border border-contrast-200 bg-contrast-200 text-sm text-[var(--product-detail-primary-text,hsl(var(--foreground)))] @3xl:grid-cols-2 @3xl:text-base">
          {attributes.map(({ name, value, colors }, index) => (
            <div className="grid min-w-0 grid-cols-2 gap-px" key={`${name}-${index}`}>
              <dt className="min-w-0 break-words bg-contrast-100 px-4 py-4 font-semibold @xl:px-6 @xl:py-5">
                {name}
              </dt>
              <dd className="min-w-0 break-words bg-background px-4 py-4 @xl:px-6 @xl:py-5">
                {colors?.length
                  ? colors.map(({ value: colorValue, label, swatchColor }, colorIndex) => (
                      <span
                        className="mr-1 inline-flex max-w-full items-center gap-1.5"
                        key={colorValue}
                      >
                        {!!swatchColor && (
                          <span
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0 rounded-full border border-contrast-200"
                            style={{ backgroundColor: swatchColor }}
                          />
                        )}
                        <span className="min-w-0">
                          {label}
                          {colorIndex < colors.length - 1 ? ',' : ''}
                        </span>
                      </span>
                    ))
                  : value}
              </dd>
            </div>
          ))}
          {attributes.length % 2 === 1 && (
            <div aria-hidden="true" className="hidden grid-cols-2 gap-px @3xl:grid">
              <div className="bg-contrast-100" />
              <div className="bg-background" />
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
