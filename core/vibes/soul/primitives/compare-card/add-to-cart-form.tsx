'use client';

import { getFormProps, SubmissionResult, useForm, useInputControl } from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod';
import { clsx } from 'clsx';
import { ReactNode, startTransition, useActionState, useEffect } from 'react';
import { requestFormReset } from 'react-dom';

import { NumberInput } from '@/vibes/soul/form/number-input';
import { Button } from '@/vibes/soul/primitives/button';
import { toast } from '@/vibes/soul/primitives/toaster';
import { useEvents } from '~/components/analytics/events';
import { useRouter } from '~/i18n/routing';

import { compareAddToCartFormDataSchema } from './schema';

type Action<S, P> = (state: Awaited<S>, payload: P) => S | Promise<S>;

interface State {
  lastResult: SubmissionResult | null;
  successMessage?: ReactNode;
}

export type CompareAddToCartAction = Action<State, FormData>;

interface Props {
  disabled?: boolean;
  productId: string;
  addToCartLabel: string;
  preorderLabel: string;
  isPreorder?: boolean;
  addToCartAction: CompareAddToCartAction;
  showQuantity?: boolean;
  size?: 'x-small' | 'small' | 'medium';
  quantityLabel?: string;
  incrementLabel?: string;
  decrementLabel?: string;
  minQuantity?: number;
  maxQuantity?: number;
  cartQuantityLink?: ReactNode;
}

export function AddToCartForm({
  productId,
  addToCartLabel,
  addToCartAction,
  isPreorder = false,
  preorderLabel,
  disabled = false,
  showQuantity = false,
  size = 'medium',
  quantityLabel = 'Quantity',
  incrementLabel = 'Increase quantity',
  decrementLabel = 'Decrease quantity',
  minQuantity = 1,
  maxQuantity,
  cartQuantityLink,
}: Props) {
  const router = useRouter();
  const events = useEvents();

  const [{ lastResult, successMessage }, formAction, pending] = useActionState(addToCartAction, {
    lastResult: null,
    successMessage: undefined,
  });

  const schema = compareAddToCartFormDataSchema.extend({
    quantity: compareAddToCartFormDataSchema.shape.quantity
      .min(minQuantity)
      .max(maxQuantity ?? Number.MAX_SAFE_INTEGER),
  });

  const [form, fields] = useForm({
    defaultValue: { quantity: minQuantity },
    constraint: getZodConstraint(schema),
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
    onSubmit(event, { formData }) {
      event.preventDefault();

      startTransition(() => {
        if (!showQuantity) requestFormReset(event.currentTarget);
        formAction(formData);

        events.onAddToCart?.(formData);
      });
    },
  });
  const quantityControl = useInputControl(fields.quantity);
  const { change: changeQuantity } = quantityControl;

  useEffect(() => {
    if (lastResult?.status === 'success') {
      if (showQuantity) changeQuantity('1');

      toast.success(successMessage);

      // This is needed to refresh the Data Cache after the product has been added to the cart.
      // The cart id is not picked up after the first time the cart is created/updated.
      router.refresh();
    }
  }, [lastResult, successMessage, router, showQuantity, changeQuantity]);

  useEffect(() => {
    if (form.errors) {
      form.errors.forEach((error) => {
        toast.error(error);
      });
    }
  }, [form.errors]);

  return (
    <form
      {...getFormProps(form)}
      action={formAction}
      className={clsx(showQuantity && 'flex items-start', size === 'x-small' ? 'gap-1.5' : 'gap-2')}
    >
      <input name="id" type="hidden" value={productId} />
      {showQuantity ? (
        <NumberInput
          aria-label={quantityLabel}
          className={clsx('shrink-0', size === 'x-small' ? 'w-auto' : 'w-28')}
          decrementLabel={decrementLabel}
          disabled={disabled || pending}
          errors={fields.quantity.errors}
          incrementLabel={incrementLabel}
          max={maxQuantity}
          min={minQuantity}
          name={fields.quantity.name}
          onBlur={quantityControl.blur}
          onChange={(event) => quantityControl.change(event.currentTarget.value)}
          onFocus={quantityControl.focus}
          required
          size={size}
          step={1}
          value={quantityControl.value}
        />
      ) : (
        <input name="quantity" type="hidden" value={1} />
      )}
      <div className={clsx('flex flex-col gap-2', showQuantity ? 'shrink-0' : 'w-full')}>
        <Button className="w-full" disabled={disabled} loading={pending} size={size} type="submit">
          {isPreorder ? preorderLabel : addToCartLabel}
        </Button>
        {cartQuantityLink}
      </div>
    </form>
  );
}
