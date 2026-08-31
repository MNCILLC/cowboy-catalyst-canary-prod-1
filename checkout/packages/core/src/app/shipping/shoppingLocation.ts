export interface ShoppingLocation {
    id: number;
    label: string;
    marker: string;
    pickupMethodId?: number;
}

const SHOPPING_LOCATION_PATTERN =
    /^\[Shopping location: (.+?) \(#(\d+)\)\](?:\[Pickup method: #(\d+)\])?\s*/;

export function getShoppingLocation(customerMessage: string): ShoppingLocation | undefined {
    const match = SHOPPING_LOCATION_PATTERN.exec(customerMessage);

    if (!match) {
        return;
    }

    return {
        id: Number(match[2]),
        label: match[1],
        marker: match[0].trim(),
        pickupMethodId: match[3] ? Number(match[3]) : undefined,
    };
}

export function getOrderComment(customerMessage: string): string {
    return customerMessage.replace(SHOPPING_LOCATION_PATTERN, '');
}

export function getCustomerMessage(
    shoppingLocation: ShoppingLocation | undefined,
    orderComment: string,
): string {
    const comment = orderComment.trim();

    if (!shoppingLocation) {
        return comment;
    }

    return `${shoppingLocation.marker}${comment ? ` ${comment}` : ''}`;
}
